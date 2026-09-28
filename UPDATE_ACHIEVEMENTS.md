# Updating completed achievements

Use the Excel workbook on your computer as the source of truth. The tracker
website's completion toggles only save progress in that browser; they do not
update the workbook or sync to other devices.

## Update the website without GitHub Desktop

1. Open `EU4_Achievements.xlsx` on your computer.
2. On the **List** worksheet, change the achievement's **Done?** cell to `Y`.
3. Save the workbook.
4. Visit the [project repository](https://github.com/ThomasKlein90/eu4_achievements).
5. On the **Code** tab, select **Add file → Upload files**.
6. Select the updated `EU4_Achievements.xlsx` from your computer. Keep the
   filename unchanged and upload it to the repository's top level.
7. Enter a commit message such as `Mark achievement complete`, select
   **Commit directly to the main branch**, then click **Commit changes**.
8. Open the repository's **Actions** tab. Wait for **Publish tracker to GitHub
   Pages** to complete successfully.
9. Open the [tracker website](https://thomasklein90.github.io/eu4_achievements/)
   and click **Refresh data** in the top bar, or reload the page.

The refresh button loads data only after the Actions workflow has published
it. It does not start the workflow.

If an old completion status still appears, the browser may have a local
progress override from an earlier tracker session. On the Achievements page,
select **Reset local progress**, confirm, then refresh the data. This clears
all local overrides in that browser and returns progress to the workbook's
completion values.

## Important visibility note

The GitHub repository is public. Anyone can view or download the workbook,
including every worksheet. The Pages website itself publishes only the tracker
and its exported JSON data, not the workbook file.
