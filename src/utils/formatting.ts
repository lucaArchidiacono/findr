export const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }
  return `${value.slice(0, maxLength - 3)}...`;
};

export const maskApiKey = (value: string | undefined): string => {
  if (!value) return "Not set";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
};

export const truncateUrl = (url: string, maxLength: number): string => {
  if (url.length <= maxLength) {
    return url;
  }

  const prefixLength = Math.floor(maxLength / 2) - 2;
  const suffixLength = maxLength - prefixLength - 3;

  return `${url.slice(0, prefixLength)}...${url.slice(-suffixLength)}`;
};
