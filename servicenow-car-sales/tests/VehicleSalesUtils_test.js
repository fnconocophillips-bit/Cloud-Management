/**
 * ATF Tests: VehicleSalesUtils
 * Run via ServiceNow Automated Test Framework
 */
describe('VehicleSalesUtils', function() {
  var utils;

  beforeEach(function() {
    utils = new VehicleSalesUtils();
  });

  it('getSalesCount returns 0 when no sales exist in range', function() {
    var count = utils.getSalesCount('2099-01-01', '2099-01-31');
    expect(count).toBe(0);
  });

  it('getTotalRevenue returns 0 when no sales exist in range', function() {
    var revenue = utils.getTotalRevenue('2099-01-01', '2099-01-31');
    expect(revenue).toBe(0);
  });

  it('getSalesByMake returns an object', function() {
    var result = utils.getSalesByMake();
    expect(typeof result).toBe('object');
  });

  it('getTopSalespeople returns array capped at limit', function() {
    var result = utils.getTopSalespeople(3);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqualTo(3);
  });

  it('getAverageDiscount returns a numeric value', function() {
    var discount = utils.getAverageDiscount();
    expect(isNaN(parseFloat(discount))).toBe(false);
  });
});
