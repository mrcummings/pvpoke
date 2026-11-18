source "https://rubygems.org"

# The PoGo PvP data viewer: run with `bundle exec jekyll s`, then open http://localhost:4014
# (port set in _config.yml). The upstream PvPoke site in src/ is PHP and doesn't use this.
gem "jekyll", "~> 4.3"
gem "csv"      # no longer built into Ruby from 3.4; needed by plugins that read CSV
gem "webrick"  # needed by `jekyll serve` on Ruby 3+

platforms :windows, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end
