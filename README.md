# EU4 Achievements

A personal Europa Universalis IV achievement tracker and campaign planner.

The tracker reads the achievement descriptions, difficulty, rarity, weighted
points and completion status from `EU4_Achievements.xlsx` (`List` worksheet).
Run groupings come from the `Runs` worksheet. The checked-in JSON file is a
web-friendly export of those worksheets; the workbook remains the source of
truth.

## Run locally

From this folder, start a local static web server:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000>.

The site is dependency-free and does not require a build step.

## Refresh the exported data

Requires Python and `openpyxl`:

```powershell
python -m pip install openpyxl
python scripts/export_workbook.py
```

To use another workbook or choose an output file:

```powershell
python scripts/export_workbook.py --input path\to\workbook.xlsx --output data\achievements.json
```

The exporter reads the workbook without modifying it. It uses the stored
calculated values for weighted points and treats only `Y` in `List` → `Done?`
as completed.

## Publish and refresh the hosted tracker

The site is published at <https://thomasklein90.github.io/eu4_achievements/>.
GitHub Actions exports the workbook and deploys the tracker whenever changes
to the workbook or site are pushed to `main`. The Pages artifact contains only
the HTML, CSS, JavaScript and exported JSON; it does not contain the workbook.

To update the hosted data without editing code:

1. Edit and save `EU4_Achievements.xlsx` in Excel.
2. Push the saved workbook to the repository's `main` branch. This can be done
   with GitHub Desktop: review the workbook change, commit it, then push.
3. Wait for the **Publish tracker to GitHub Pages** workflow to finish under
   the repository's **Actions** tab. It regenerates and commits
   `data/achievements.json`, then publishes the updated site.
4. Reload the website, or use **Refresh data** in the top bar to fetch the
   latest published dataset without a full page reload.

The refresh button loads data already published to Pages; it does not start a
workflow. Deployment must finish first. Progress overrides saved in the
current browser are preserved when data is refreshed and can be cleared with
**Reset local progress** on the achievements page.

## Progress and privacy

Completion can be toggled in the achievement list or within a run. Changes are
saved to local browser storage and override the workbook values only in that
browser; they do not modify the workbook or sync to a server. Resetting local
progress restores the completion values from the exported workbook.
Run cards show their workbook run difficulty and the difficulty of each
achievement. Expand a run, then select an achievement to view its conditions,
requirements and notes inline.

Weighted completion is the sum of earned achievement points divided by all
achievement points. Point totals are rounded to whole points for display while
calculations retain the workbook's precise values. The run planner only shows
runs with at least one uncompleted achievement. Each run's available value is
the sum of points for its uncompleted achievements, and its share of total is
that value divided by all achievement points. Because an achievement can
appear in more than one planned run, the overall run-points figure can count
the same achievement in multiple plans.

Achievement and run difficulty filters support selecting multiple difficulty
tiers at once. All tiers are selected by default; use the checkbox dropdown's
“All difficulties” option to quickly select or clear every tier.
