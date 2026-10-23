// Shop demand helper. A level-1 store at the fair price (basePrice x 1.5,
// quality 0) sells dailyDemand / 24 units an hour, so to earn TARGET dollars
// an hour: dailyDemand = 24 * TARGET / (basePrice * 1.5).
export const SHOP_TARGET_PER_H = 200
export const SHOP_DD = (basePrice: number) => (24 * SHOP_TARGET_PER_H) / (basePrice * 1.5)
