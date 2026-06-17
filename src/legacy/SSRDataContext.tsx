import { createContext, useContext, type ReactNode } from "react";

export interface SSRBanner {
  imageUrl?: string;
  altText?: string;
  ctaUrl?: string;
  heightPx?: number;
  objectFit?: string;
  objectPositionX?: number;
  objectPositionY?: number;
  overlayEnabled?: boolean;
  overlayColor?: string;
  overlayOpacity?: number;
  overlayText?: string;
  overlaySubtext?: string;
  gradientEnabled?: boolean;
  gradientColor?: string;
  gradientIntensity?: number;
  gradientDirection?: string;
}

interface SSRData {
  banner: SSRBanner | null;
}

const SSRDataContext = createContext<SSRData>({ banner: null });

export function SSRDataProvider({ value, children }: { value: SSRData; children: ReactNode }) {
  return <SSRDataContext.Provider value={value}>{children}</SSRDataContext.Provider>;
}

export function useSSRBanner(): SSRBanner | null {
  return useContext(SSRDataContext).banner;
}
