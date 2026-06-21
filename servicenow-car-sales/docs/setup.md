# Vehicle Sales Tracker — ServiceNow App

Track vehicles in your dealership inventory, log sales, and report on revenue.

## Quick Start

### Prerequisites
- ServiceNow instance (developer or production)
- Admin credentials
- Node.js 14+

### Install

```bash
cd servicenow-car-sales
node sdk/install.js \
  --instance my-instance \
  --user admin \
  --password mypassword
```

Or use environment variables:

```bash
export SN_INSTANCE=my-instance
export SN_USER=admin
export SN_PASSWORD=mypassword
node sdk/install.js
```

### Export Sales Data

```bash
node sdk/export.js --instance my-instance --user admin --password mypassword
# outputs: vehicle_sales_export.json
```

---

## Data Model: `u_vehicle_sales`

| Field | Type | Description |
|-------|------|-------------|
| u_vin | String (17) | Vehicle Identification Number — unique, validated |
| u_make | String | Manufacturer (Toyota, Ford, etc.) |
| u_model | String | Model name |
| u_year | Integer | Model year |
| u_color | String | Exterior color |
| u_mileage | Integer | Odometer reading (required for used/CPO) |
| u_condition | Choice | new / used / certified |
| u_asking_price | Decimal | List price |
| u_sale_price | Decimal | Final sale price |
| u_sale_status | Choice | available / reserved / sold / returned |
| u_sale_date | Date | Auto-set when status → sold |
| u_buyer_name | String | Customer name |
| u_buyer_email | Email | Customer email |
| u_buyer_phone | Phone | Customer phone |
| u_salesperson | Reference | sys_user reference |
| u_notes | String | Free-form notes |

## Application Components

| Component | Purpose |
|-----------|---------|
| `src/tables/vehicle_table.json` | Table & field definitions |
| `src/business_rules/validate_vin.js` | VIN format validation (17 chars, no I/O/Q) |
| `src/business_rules/set_sale_date.js` | Auto-sets sale date on status change |
| `src/script_includes/VehicleSalesUtils.js` | Server-side utility: counts, revenue, rankings |
| `src/client_scripts/vehicle_sale_form.js` | Form UX: hide/show buyer fields |
| `src/ui_policies/ui_policy.json` | Field rules by condition/status |
| `src/forms/vehicle_sale_form_layout.json` | Form section layout |
| `src/lists/vehicle_sales_list_view.json` | List columns and saved filters |
| `sdk/install.js` | Automated installer via Table API |
| `sdk/export.js` | Export records to JSON |
| `tests/VehicleSalesUtils_test.js` | ATF unit tests |

## Key Automations

- **VIN Validation**: Enforces 17-char format and blocks I, O, Q characters
- **Auto Sale Date**: Sets `u_sale_date` to today when status changes to *sold*
- **Field Cleanup**: Clears buyer/price fields if a sale is reversed
- **Mileage Rules**: Mandatory for used/CPO, hidden for new vehicles
- **Lock on Sale**: Core vehicle fields become read-only after sold
