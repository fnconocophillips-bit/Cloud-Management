/**
 * Business Rule: Validate VIN Format
 * Table: u_vehicle_sales
 * When: Before Insert/Update
 * Condition: Always
 */
(function executeRule(current, previous) {
  var vin = current.u_vin.toString().toUpperCase().trim();

  if (vin.length !== 17) {
    current.setAbortAction(true);
    gs.addErrorMessage('VIN must be exactly 17 characters. Provided: ' + vin.length);
    return;
  }

  // VINs cannot contain I, O, or Q
  if (/[IOQ]/.test(vin)) {
    current.setAbortAction(true);
    gs.addErrorMessage('VIN cannot contain the letters I, O, or Q.');
    return;
  }

  current.u_vin = vin;
})(current, previous);
