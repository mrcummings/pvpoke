# upstream_files.rb: publishes the parts of upstream PvPoke (src/) that the Team Finder runs:
# the battle engine's JavaScript files and the data they load. They're served at the same
# paths as in the repo (/src/js/..., /src/data/...), which is where upstream's code expects
# them (it's given webRoot "/src/").
#
# Nothing is copied into the repo: the files are read from src/ at build time, so pulling in
# upstream's updates updates the Team Finder too. The rest of src/ (the PHP site) stays
# excluded by _config.yml.
#
# Excluded folders aren't watched by `jekyll s`: restart it after upstream's files change.

module PogoPvp
  class UpstreamFiles < Jekyll::Generator
    safe true
    priority :normal

    # The engine, in the order the Team Finder's worker loads them.
    ENGINE = %w[
      js/GameMaster.js
      js/pokemon/Pokemon.js
      js/battle/DamageCalculator.js
      js/battle/actions/ActionLogic.js
      js/battle/timeline/TimelineEvent.js
      js/battle/timeline/TimelineAction.js
      js/training/DecisionOption.js
      js/battle/Battle.js
      js/battle/rankers/TeamRanker.js
      js/interface/PokeMultiSelect.js
    ].freeze

    # Data the engine loads: the game master (upstream loads gamemaster.json when the address
    # contains "localhost", gamemaster.min.json otherwise), the overall rankings (threats'
    # recommended movesets, Safety scores), and the meta groups.
    DATA = %w[
      data/gamemaster.json
      data/gamemaster.min.json
      data/rankings/*/overall/rankings-*.json
      data/groups/*.json
    ].freeze

    def generate(site)
      src = File.join(site.source, "src")
      count = 0
      (ENGINE + DATA).each do |pattern|
        matches = Dir.glob(File.join(src, pattern))
        raise "PoGo PvP: upstream file not found: src/#{pattern}" if matches.empty?

        matches.each do |path|
          rel_dir = File.dirname(path).delete_prefix(site.source)
          site.static_files << Jekyll::StaticFile.new(site, site.source, rel_dir, File.basename(path))
          count += 1
        end
      end
      Jekyll.logger.info "PoGo PvP:", "published #{count} upstream files under /src/ for the Team Finder"
    end
  end
end
