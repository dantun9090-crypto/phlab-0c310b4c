import * as React from "react";
import { Section, Text } from "@react-email/components";
import type { EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
  align?: "left" | "center" | "right";
  fontSize?: number;
  color?: string;
  children: React.ReactNode;
}

export function EmailTextBlock({
  brand,
  align = "left",
  fontSize = 15,
  color,
  children,
}: Props) {
  return (
    <Section style={{ padding: "16px 32px" }}>
      <Text
        style={{
          margin: 0,
          fontFamily: brand.fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: 1.6,
          color: color || brand.textColor,
          textAlign: align,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}
