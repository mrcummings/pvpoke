# rankings_pages.rb: makes one page per ranking list in src/data/rankings/ (set by `rankings:`
# in _config.yml), using the overall rankings (`rankings_category:`).
#
#   src/data/rankings/<cup>/overall/rankings-<CP limit>.json
#     all/1500  => /rankings/                (Great League: the default view)
#     otherwise => /rankings/<cup>/<CP>/     for example /rankings/classic/2500/
#
# Each page shows the ranking as a table (_layouts/rankings.html), with a dropdown at the top
# that switches between rankings. The dropdown's list is stored in site.data["rankings"]:
#   "top"  => Great League, Ultra League, Master League, in that order
#   "rest" => every other ranking, alphabetical by label; a cup's leagues stay together,
#             lowest CP first
#
# Labels: the cup "all" is named by its league (Great League and so on). Otherwise the label is
# upstream's format title for that cup and CP if there is one (gamemaster.json "formats"), else
# the cup's title (gamemaster.json "cups", or the cup's file in src/data/gamemaster/cups/,
# including archive/), else the folder name. A cup with rankings for several CP limits gets the
# league added, for example "Classic (Ultra League)".
#
# The columns come from the JSON, like the other tables (see gamemaster_tables.rb). The first
# ones are rank, speciesName, speciesId, score, scores and moveset (LEAD below); rank and name
# stay in view while scrolling sideways. Also:
#   - rank: the entry's position in the file (1 = first). The files are in score order.
#   - scores: six numbers, shown as scores.leads, scores.closers, scores.switches,
#     scores.chargers, scores.attackers, scores.consistency. This order is how upstream's
#     src/js/battle/rankers/RankerOverall.js builds them (checked against the category files,
#     2026-11-18).
#   - matchups and counters: "opponent (rating)", for example "mimikyu (729)".
#   - moves.fastMoves and so on: "MOVE_ID (uses)".

module PogoPvp
  class RankingsPages < Jekyll::Generator
    safe true
    priority :high

    LEAGUES = {
      500   => "Little League",
      1500  => "Great League",
      2500  => "Ultra League",
      10000 => "Master League",
    }.freeze

    TOP = [["all", 1500], ["all", 2500], ["all", 10000]].freeze
    DEFAULT = ["all", 1500].freeze

    SCORE_NAMES = %w[leads closers switches chargers attackers consistency].freeze

    # Columns shown first (rank and name stay in view); the rest follow in the JSON's order.
    LEAD = %w[rank speciesName speciesId score scores moveset].freeze

    def generate(site)
      dir = site.config.fetch("rankings", "src/data/rankings")
      category = site.config.fetch("rankings_category", "overall")
      gm = Tables.read_json(site, site.config.fetch("gamemaster", "src/data/gamemaster.json"))
      root = File.join(site.source, dir)
      raise "PoGo PvP: rankings folder not found at #{dir}" unless Dir.exist?(root)

      # Every <cup>/<category>/rankings-<cp>.json
      found = Dir.glob(File.join(root, "*", category, "rankings-*.json")).map do |path|
        cup = File.basename(File.dirname(File.dirname(path)))
        cp = File.basename(path)[/\d+/].to_i
        [cup, cp, path]
      end
      cps_per_cup = found.group_by(&:first).transform_values(&:size)

      entries = found.map do |cup, cp, path|
        {
          "cup"    => cup,
          "cp"     => cp,
          "league" => LEAGUES[cp] || "#{cp} CP",
          "label"  => label(site, gm, cup, cp, cps_per_cup[cup] > 1),
          "url"    => [cup, cp] == DEFAULT ? "/rankings/" : "/rankings/#{cup}/#{cp}/",
          "source" => "#{dir}/#{cup}/#{category}/#{File.basename(path)}",
          "path"   => path,
        }
      end

      # Labels must be unique, or the dropdown is ambiguous.
      entries.group_by { |e| e["label"] }.each_value do |same|
        same.each { |e| e["label"] = "#{e['label']} (#{e['cup']}, #{e['cp']} CP)" } if same.size > 1
      end

      top = TOP.filter_map { |cup, cp| entries.find { |e| e["cup"] == cup && e["cp"] == cp } }

      # Alphabetical, except that a cup's leagues stay together, lowest CP first: they all sort
      # under the label of the cup's lowest-CP ranking (Classic: Little, Great, Ultra, Master).
      others = entries - top
      group_label = others.group_by { |e| e["cup"] }.transform_values { |es| es.min_by { |e| e["cp"] }["label"] }
      rest = others.sort_by { |e| [group_label[e["cup"]].downcase, e["cp"]] }

      menu_item = ->(e) { e.slice("label", "url", "cup", "cp") }
      site.data["rankings"] = {
        "category" => category,
        "top"      => top.map(&menu_item),
        "rest"     => rest.map(&menu_item),
      }

      rows_total = 0
      (top + rest).each do |e|
        list = JSON.parse(File.read(e["path"], encoding: "bom|utf-8"))
        table = Tables.build(list.each_with_index.map { |r, i| record(r, i) }, LEAD, 2)
        rows_total += table["rows"].size

        page = Jekyll::PageWithoutAFile.new(site, site.source, e["url"].delete_prefix("/"), "index.html")
        page.content = ""
        page.data.merge!(
          "layout"     => "rankings",
          "title"      => "#{e['label']} rankings",
          "permalink"  => e["url"],
          "ranking"    => e.reject { |k, _| k == "path" },
          "table_data" => table
        )
        site.pages << page
      end

      Jekyll.logger.info "PoGo PvP:", "rankings: #{entries.size} pages, #{rows_total} rows (#{category})"
    end

    private

    def label(site, gm, cup, cp, several)
      return LEAGUES[cp] || "All Pokémon (#{cp} CP)" if cup == "all"

      format = Array(gm["formats"]).find { |f| f["cup"] == cup && f["cp"] == cp }
      return format["title"] if format && format["title"]

      title = cup_title(site, gm, cup)
      several ? "#{title} (#{LEAGUES[cp] || "#{cp} CP"})" : title
    end

    def cup_title(site, gm, cup)
      found = Array(gm["cups"]).find { |c| c["name"] == cup }
      return found["title"] if found && found["title"]

      cups_dir = File.join(site.source, "src/data/gamemaster/cups")
      [File.join(cups_dir, "#{cup}.json"), File.join(cups_dir, "archive", "#{cup}.json")].each do |f|
        next unless File.exist?(f)
        title = JSON.parse(File.read(f, encoding: "bom|utf-8"))["title"]
        return title if title
      end
      cup
    end

    # One ranking entry => one table record, with the nested parts made readable.
    def record(entry, index)
      r = { "rank" => index + 1 }
      entry.each do |k, v|
        r[k] =
          case k
          when "scores"
            v.is_a?(Array) ? v.each_with_index.to_h { |s, j| [SCORE_NAMES[j] || "score#{j + 1}", s] } : v
          when "matchups", "counters"
            v.is_a?(Array) ? v.map { |m| m.is_a?(Hash) ? "#{m['opponent']} (#{Tables.text(m['rating'])})" : m } : v
          when "moves"
            if v.is_a?(Hash)
              v.transform_values do |list|
                list.is_a?(Array) ? list.map { |m| m.is_a?(Hash) ? "#{m['moveId']} (#{Tables.text(m['uses'])})" : m } : list
              end
            else
              v
            end
          else
            v
          end
      end
      r
    end
  end
end
