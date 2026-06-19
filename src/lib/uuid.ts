export const generateUuid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  let uuid = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
      continue;
    }
    if (i === 14) {
      uuid += "4";
      continue;
    }
    const random = (Math.random() * 16) | 0;
    const value = i === 19 ? (random & 0x3) | 0x8 : random;
    uuid += value.toString(16);
  }
  return uuid;
};
