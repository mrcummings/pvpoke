# gamemaster_tables.rb: reads PvPoke's game master (src/data/gamemaster.json, set by
# `gamemaster:` in _config.yml) and turns three of its lists into tables for the site:
#
#   site.data["gamemaster"]["tables"]["pokemon" | "moves" | "cups"]
#     "columns" => [{ "label" => "baseStats.atk", "numeric" => true }, ...]
#     "rows"    => [["Magnezone", "462", ...], ...]   one array of strings per record
#
# The pages (pokemon.html, moves.html, cups.html) render a table with _layouts/table.html.
#
# Every field in the data gets a column, so nothing is hidden. How values become text:
#   - A field that's an object in every record (baseStats, defaultIVs, family, formChange)
#     gets one column per key, labeled "field.key" (for example baseStats.atk).
#   - A list of plain values (types, fastMoves) is joined with ", ".
#   - A cup filter ({filterType, name, values}) becomes "type: bug, dark", one per line.
#   - Anything else that's nested is shown as compact JSON.
#   - A missing field is an empty cell; a field that's present but null shows "null".
# The JSON file is never changed or copied.

require "json"

module PogoPvp
  class GamemasterTables < Jekyll::Generator
    safe true
    priority :highest

    # The list in gamemaster.json => the field shown first, and kept in view while scrolling.
    SUBJECTS = {
      "pokemon" => "speciesName",
      "moves"   => "name",
      "cups"    => "title",
    }.freeze

    NUMBER = /\A-?\d+(\.\d+)?\z/

    def generate(site)
      rel = site.config.fetch("gamemaster", "src/data/gamemaster.json")
      path = File.join(site.source, rel)
      raise "PoGo PvP: game master not found at #{rel}" unless File.exist?(path)

      gm = JSON.parse(File.read(path, encoding: "bom|utf-8"))

      tables = {}
      SUBJECTS.each do |subject, key|
        records = gm.fetch(subject)
        tables[subject] = build_table(records, key)
        t = tables[subject]
        Jekyll.logger.info "PoGo PvP:", "#{subject}: #{t['rows'].size} rows, #{t['columns'].size} columns"
      end

      site.data["gamemaster"] = {
        "source"    => rel,
        "id"        => gm["id"],
        "timestamp" => gm["timestamp"],
        "tables"    => tables,
      }
    end

    private

    def build_table(records, key)
      # Fields in order of first appearance across all records, so rare fields aren't lost.
      fields = []
      records.each { |r| r.each_key { |f| fields << f unless fields.include?(f) } }
      fields.delete(key)
      fields.unshift(key)

      # Expand a field into "field.key" columns only if it's an object everywhere it appears.
      columns = []
      fields.each do |f|
        present = records.map { |r| r[f] }.reject(&:nil?)
        if !present.empty? && present.all? { |v| v.is_a?(Hash) }
          subkeys = []
          present.each { |h| h.each_key { |k| subkeys << k unless subkeys.include?(k) } }
          subkeys.each { |k| columns << [f, k] }
        else
          columns << [f, nil]
        end
      end

      # A field that's missing is an empty cell; a field that's present but null shows "null".
      rows = records.map do |r|
        columns.map do |f, k|
          if !r.key?(f)
            ""
          elsif k
            r[f].is_a?(Hash) && r[f].key?(k) ? text(r[f][k], "null") : ""
          else
            text(r[f], "null")
          end
        end
      end

      cols = columns.each_with_index.map do |(f, k), i|
        values = rows.map { |row| row[i] }.reject(&:empty?)
        {
          "label"   => k ? "#{f}.#{k}" : f,
          "numeric" => !values.empty? && values.all? { |s| s.match?(NUMBER) },
        }
      end

      { "columns" => cols, "rows" => rows }
    end

    def text(v, null_text = "")
      case v
      when nil then null_text
      when String then v.strip
      when Float then v == v.floor ? v.to_i.to_s : v.to_s
      when Numeric, true, false then v.to_s
      when Array
        if v.all? { |x| !x.is_a?(Hash) && !x.is_a?(Array) }
          v.map { |x| text(x) }.join(", ")
        else
          v.map { |x| text(x) }.join("\n")
        end
      when Hash
        if v.key?("filterType")
          label = v["filterType"].to_s
          label += " (#{v['name']})" if v["name"]
          values = Array(v["values"])
          "#{label}: #{values.empty? ? '(none)' : values.map { |x| text(x) }.join(', ')}"
        else
          JSON.generate(v)
        end
      else
        v.to_s
      end
    end
  end
end
