import * as React from "react";
import { Hr, Section } from "@react-email/components";

interface Props {
  color?: string;
  spacing?: number;
}

export function EmailDivider({ color = "#e2e8f0", spacing = 12 }: Props) {
  return (
    <Section style={{ padding: `${spacing}px 32px` }}>
      <Hr style={{ borderColor: color, borderTop: `1px solid ${color}`, margin: 0 }} />
    </Section>
  );
}
