/**
 * Business Rule: Set Sale Date on Status Change
 * Table: u_vehicle_sales
 * When: Before Insert/Update
 * Condition: Sale status changes to 'sold'
 */
(function executeRule(current, previous) {
  if (current.u_sale_status == 'sold' && current.u_sale_date.nil()) {
    current.u_sale_date = new GlideDateTime().getDate();
  }

  if (current.u_sale_status != 'sold') {
    current.u_sale_date = '';
    current.u_sale_price = '';
    current.u_buyer_name = '';
    current.u_buyer_email = '';
    current.u_buyer_phone = '';
  }
})(current, previous);
