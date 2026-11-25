# Renewal Bench

[Open Renewal Bench](https://coolcode.ca/renewalbench/) — a private Canadian fixed-rate mortgage renewal workspace. Enter up to eight written offers and compare payments, interest, fees and debt remaining on the **same date**. There are no live lender rates, accounts, API keys, data collectors or scheduled refreshes.

<!-- coolcode:guide -->
Compare written fixed-rate offers over a period no longer than the shortest term. The editable example compares a $400,000 mortgage over 36 months, with different rates and upfront fees; those offers are invented. Include your own fees and lender-quoted penalties, then inspect both borrowing cost and the amount owing. Dated lump sums apply to every offer; recurring extras and contract limits are set per offer. Save deliberately on your device or export a private JSON workspace, schedule CSV and text report.
<!-- /coolcode:guide -->

## Use your own offers

1. Enter the starting balance, renewal/advance date, remaining amortization in months, and common comparison horizon. For example, 240 months means 20 years. A 36-month and 60-month offer can both be compared for 36 months; this does **not** value the following 24 months or imply the longer contract ends then.
2. Replace the invented offer names, nominal annual fixed rates, term lengths and payment frequencies. Add or duplicate offers as needed. All dollars are CAD.
3. Open **Fees, extra payments & contract notes**. Enter upfront fees, financed fees, retained cashback, and any lender-quoted penalty/clawback. Zero means no amount is included, not that the lender confirmed no charge. Record quote dates/expiry and conditions in notes.
4. Optionally enter a quoted base payment, excluding tax/insurance and recurring extras. Otherwise the tool calculates a base payment. Add recurring extras per offer, or dated lump sums shared across every offer.
5. Enter the actual annual lump-sum dollar allowance and recurring increase percentage if known. Blank means unknown; zero permits none. The checks only compare amounts, not every contractual restriction. The app never guesses a lender's interest-rate differential or a future renewal rate.
6. Compare, review warnings, and open **Payment schedule**. Editing any input invalidates the displayed results until you recalculate.
7. Save explicitly in this browser, or export JSON to reopen elsewhere. CSV contains the selected offer's event schedule; the text report contains all comparison results and assumptions. Files contain personal financial inputs: choose where you share them.

## Calculation convention

This model covers nominal annual **fixed** rates compounded twice annually. It does not model variable rates or determine qualification.

For annual rate `j` as a decimal and `f` payments per year, the equivalent period rate is `(1 + j/2)^(2/f) - 1`. A monthly annuity uses the entered remaining amortization and rounds to cents. Payment amounts follow FCAC's published frequency conversions, with final cent rounding:

| Frequency | Base amount | Dates in this model |
| --- | --- | --- |
| Monthly | Monthly annuity | Monthly start-date anniversaries |
| Twice monthly | Monthly ÷ 2 | Midpoint, then next monthly anniversary |
| Every two weeks | Monthly × 12 ÷ 26 | Every 14 days |
| Weekly | Monthly × 12 ÷ 52 | Every 7 days |
| Accelerated every two weeks | Monthly ÷ 2 | Every 14 days |
| Accelerated weekly | Monthly ÷ 4 | Every 7 days |

A quoted base payment overrides the amount calculation. Monthly anniversaries preserve month-end starts; other days clamp in short months. Twice-monthly midpoint dates round down to a day. First payments occur after the start date. Weekly calendars may include 53 dates in a year, or 27 biweekly dates. Business-day shifts, irregular first periods and arbitrary lender debit calendars are not implemented; compare the schedule to the actual lender offer.

Between regular dates, interest compounds proportionally to the elapsed days in that scheduled period. For example, a lump sum halfway between monthly dates uses half the equivalent monthly growth exponent before and after that event. Money is held as integer cents; accrued interest rounds at **every cash event** and the comparison end. This explicit estimate convention can differ from lender daily-accrual, capitalization and rounding rules. A non-payment comparison end includes its accrued interest.

On the same day, regular payment applies first, then recurring extra, then lump sums. Payments are capped at the debt remaining; no interest accrues after payoff. If the debt grows or an entered payment fails to cover accrued interest, the app warns. Over-limit planned prepayments remain in the model and produce warnings; they are not silently reduced to a contractual cap. Requested lumps after payoff are not spent.

Upfront fees and the entered penalty are paid at the start. Financed fees increase debt and therefore interest. Retained cashback is received at the start. Additional unknown penalties, cashback clawbacks, taxes, insurance, investment returns, discounting/time value of money and switching expenses not entered are excluded.

- **Borrowing cost** = interest + upfront fees + financed fees + entered penalty − cashback kept.
- **Net cash outlay** = actual mortgage payments (including extras/lumps) + upfront fees + entered penalty − cashback kept.
- Accounting check: cash outlay + amount owing − original starting balance = borrowing cost.

The lump cap resets on each loan anniversary, not January 1. A lender may instead use a calendar year, original balance percentages, particular dates, minimums, a limited number of payments, or approval rules. Those are recorded in notes and require review. A small cost difference may be outweighed by portability, contract restrictions or other excluded factors. These are estimates, not a recommendation to accept an offer.

## Sources and validation

Method reviewed **2026-11-25** against these primary sources. The date is a method review, not a quote date or a claim that market rates were updated:

- [FCAC: choosing a mortgage — terms, frequency conversions, cashback and flexibility](https://www.canada.ca/en/financial-consumer-agency/services/mortgages/choose-mortgage.html)
- [FCAC: fixed mortgage information-box example — compounding and required disclosures](https://www.canada.ca/en/financial-consumer-agency/services/industry/bulletins/information-box-examples/credit-agreement-fixed-mortgage.html)
- [FCAC: prepayment privileges and penalties](https://www.canada.ca/en/financial-consumer-agency/services/mortgages/reduce-prepayment-penalties.html)
- [FCAC: renewing your mortgage](https://www.canada.ca/en/financial-consumer-agency/services/mortgages/renew-mortgage.html)
- [FCAC mortgage calculator](https://itools-ioutils.fcac-acfc.gc.ca/MC-CH/MC-CH-eng.aspx?lang=eng)

The model regression tests include the familiar $100,000 / 5% / 25-year monthly payment of $581.60. Independent present-value summation, monthly closed-form balances and daily accumulation check the implementation separately from its event loop. Tests cover frequency conversions, leap/month-end dates, partial final periods, equal horizons, lump timing/order, fees, limits, underpayment, capped payoff, safe exports, and adding offers beyond the example count. The FCAC information-box example also includes payment elements such as possible property tax; this app does not claim to reproduce that example's displayed all-in payment.

## Privacy and storage

Quote inputs and imported files remain in tab memory until **Save on this device**. Explicit local storage uses `coolcode:renewalbench:workspace`. Load does not change the saved file; Forget saved removes that key without clearing the active tab. There is no automatic save, cloud account or third-party financial API. JSON imports must have schema `coolcode.renewalbench.v1`, valid known fields and be smaller than 1 MB. Limits are eight offers, 200 dated lumps, 480 amortization months and 120 comparison months. These are browser model bounds, not lending eligibility rules.

The built page fetches its bundled invented example. The shared CoolCode metrics script records aggregate tool opens by tool ID only; quote inputs and URL parameters are excluded. Source/help links leave the site only when opened. All user strings render as text, never HTML. CSV cells that could trigger spreadsheet formulas are escaped. Downloads are generated locally; no upload endpoint exists.

## Develop and publish

No npm install or production dependency is needed. Use Node 24+ and Python 3.12+:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

Browser tests use Playwright as a test-only dependency. On Ubuntu with Google Chrome installed:

```sh
python3 -m pip install -r tests/browser-requirements.txt
CHROMIUM_PATH="$(command -v google-chrome)" python3 tests/browser_smoke.py
```

CI uses `ubuntu-24.04` and the runner's Google Chrome, checks desktop/mobile flows at a project subpath, and uploads screenshots. PRs check and build. Successful `main` builds deploy via GitHub Pages; set **Settings → Pages → Source → GitHub Actions**. Deploy only `dist/`; do not commit it or add a CNAME. Keep relative assets for `/renewalbench/`.

## Expand or customize

The editable starting scenario is `web/data/example.json`. Change its balance, dates, fees or `quotes` array while preserving the schema. For example, add a third quote object with its own name, rate, term and fee fields; quote counts and validation follow the actual input and do not require two offers. Values are invented examples and must remain labelled as such. Visitors can enter unrelated offers, save their own workspace, or import a valid JSON file without changing the repository.

Payment formulas, bounds and calendar conventions live in `web/model.mjs`; UI bindings live in `web/app.mjs`. If a new convention is added, keep it explicit in saved inputs, schedules, reports, tests and this README rather than changing a result silently. Add a model test and a browser flow for any new feature. Run the commands above, commit and push to `main`; there is no data-fetch workflow to run and no API key/secret to set.

For release, the hub imports `tool.json` and the marked guide, regenerates its homepage/README, Worker registration and sitemap, and reconciles repository audit and live-page probes. Follow the [CoolCode lifecycle](https://github.com/jsdyer/jsdyer.github.io/blob/main/docs/tool-lifecycle.md). There is **no collector or freshness schedule** to register with the watchdog for this app; its ordinary public-page probe still belongs in hub integration. Template helper scripts remain for future maintenance but are not active scheduled jobs.
