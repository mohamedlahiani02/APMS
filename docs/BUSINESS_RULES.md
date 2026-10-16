# Preserved business rules

The production handover schema and recovered backend are the reference. The new API contract is in API_CONTRACT.md.

## Purchases and sales

BL achats contain a date, number, store, supplier and product lines. Product references and référentiel codes are immutable after creation. Référentiels and purchases are soft-deleted. TVA is 7, 13 or 19 percent. Quantities and money are stored as decimals with three places and HALF_UP rounding. The old integer-quantity constraints apply to frozen legacy tables; the active BL/vente tables accept fractional quantities. Unit sale prices must be positive; purchase prices may be zero.

Transaction dates must be valid calendar dates, no later than today and no earlier than January 1 of the current year. Every transaction needs its date in the calendar dimension. Dates are stored as date-only values, with business periods interpreted in Africa/Tunis.

A sale automatically draws from the product's BL lines in its store, oldest purchase date then oldest creation time first. It splits into one persisted row per source. Remaining demand uses the store's legacy lot, creating a zero-stock lot if needed. Only the trailing legacy line may show depassementStock and qteNonCouverte. Overselling is allowed; the full requested quantity and revenue remain in the sale.

Editing a sale reverses all covered draws, deletes old lines and redraws in the same transaction. Deleting physically removes the sale after reversing covered quantities. Uncovered quantities never create stock on reversal. Stock is clamped at zero for display.

BL header fields remain editable after sales. Replacing lines is blocked once any current line has been drawn from. Deletion is blocked while sale lines reference the BL. Once sales are reversed/deleted, untouched balances can be edited again. Line replacement soft-deletes and reinserts; it is not a line diff.

## Reporting

Current stock lists the remaining BL quantities plus available legacy quantities by product/store. Its HT valuation uses each lot's unit cost; it is distinct from the monthly analytics CMUP valuation. The analytics service calls get_kpi_lines_for_month and preserves the original snapshot algorithm. Drilldowns expose stock, CMUP, value and deficit.

Annual evolution and cumulative purchases/sales sum direct monthly transaction totals. Annual stock is the final month's snapshot value, never the sum of monthly stock values. Annual rankings describe the last month of the period and are labelled accordingly. Margin is sales minus purchases in the preserved reporting definition, not a separately reconstructed accounting profit.

The combined Excel download contains BL Achats and Ventes sheets, both filtered by store and date range. The frozen transactions_legacy and stock tables are historical references. The unused print-BL and per-resource export routes are intentionally omitted.

## Accounts and history

New and reset accounts require a password change. Role and account activity are checked on authenticated requests. Administrator-only resources are protected at the API and in navigation. Every mutation and authentication event writes an audit record. The historical duplicate reference 01381 is preserved; no production rows are renamed or merged automatically.
