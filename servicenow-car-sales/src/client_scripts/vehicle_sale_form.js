/**
 * Client Script: Vehicle Sale Form Logic
 * Type: onChange / onLoad
 * Table: u_vehicle_sales
 */

// onLoad — show/hide buyer fields based on status
function onLoad() {
  toggleBuyerFields(g_form.getValue('u_sale_status'));
}

// onChange — react when sale status changes
function onChange(control, oldValue, newValue) {
  if (control === 'u_sale_status') {
    toggleBuyerFields(newValue);
  }

  if (control === 'u_asking_price' || control === 'u_sale_price') {
    updateDiscountDisplay();
  }
}

function toggleBuyerFields(status) {
  var buyerFields = ['u_buyer_name', 'u_buyer_email', 'u_buyer_phone', 'u_sale_price', 'u_sale_date'];
  var isSold = (status === 'sold');

  buyerFields.forEach(function(field) {
    g_form.setVisible(field, isSold);
    g_form.setMandatory(field, isSold && (field === 'u_buyer_name' || field === 'u_sale_price'));
  });
}

function updateDiscountDisplay() {
  var asking = parseFloat(g_form.getValue('u_asking_price')) || 0;
  var sale   = parseFloat(g_form.getValue('u_sale_price')) || 0;

  if (asking > 0 && sale > 0) {
    var discount = (((asking - sale) / asking) * 100).toFixed(1);
    var msg = discount > 0
      ? 'Discount: ' + discount + '% off asking price'
      : 'Sale price is at or above asking price';
    g_form.addInfoMessage(msg);
  }
}
