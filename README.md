# Feed builder for courts.go.jp

This script runs a trawl of the courts.go.jp site to build Atom feeds
of court judgments.

Cases are automatically divided among Civil, Criminal, IP, Labor, and
Administrative feeds.

Running the script as `node ./scraper.js 2>/dev/null` without arguments
collects cases from 30 days in the past.

Running the script with a single numeric argument, say as `node
./scraper.js 2 2>/dev/null`, will backtrack by the given number of
30-day intervals, and collect 30 days of cases from that point
forward.

Feeds are save locally, in the directory from which the script is
executed.

Saved feeds are treated as a cache, and only the most recent 50
cases in each feed are saved.

Executing the script with an argument is only needed to
set up the initial feed content. Afterward, executing the script
without arguments once or twice a week will keep the feeds fresh.
