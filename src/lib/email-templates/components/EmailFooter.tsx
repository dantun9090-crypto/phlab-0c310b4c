import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import type { EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
  unsubscribeUrl?: string;
}

export function EmailFooter({ brand, unsubscribeUrl }: Props) {
  const social = brand.socialLinks || {};
  const socialEntries = (
    [
      ["Instagram", social.instagram],
      ["Twitter", social.twitter],
      ["Facebook", social.facebook],
      ["LinkedIn", social.linkedin],
    ] as const
  ).filter(([, href]) => Boolean(href));

  const linkStyle: React.CSSProperties = {
    color: brand.mutedTextColor,
    fontSize: "12px",
    textDecoration: "underline",
    margin: "0 6px",
    fontFamily: brand.fontFamily,
  };

  return (
    <Section
      style={{
        padding: "24px 32px 32px",
        backgroundColor: brand.surfaceColor,
        borderTop: "1px solid #e2e8f0",
        textAlign: "center",
      }}
    >
      {socialEntries.length > 0 ? (
        <Text style={{ margin: "0 0 12px", fontFamily: brand.fontFamily }}>
          {socialEntries.map(([label, href]) => (
            <Link key={label} href={href!} style={linkStyle}>
              {label}
            </Link>
          ))}
        </Text>
      ) : null}
      <Text
        style={{
          margin: "0 0 8px",
          fontFamily: brand.fontFamily,
          fontSize: "12px",
          color: brand.mutedTextColor,
          lineHeight: 1.5,
        }}
      >
        {brand.footerText}
      </Text>
      <Text
        style={{
          margin: "0 0 8px",
          fontFamily: brand.fontFamily,
          fontSize: "12px",
          color: brand.mutedTextColor,
        }}
      >
        {brand.companyAddress}
      </Text>
      {unsubscribeUrl ? (
        <Text style={{ margin: 0, fontFamily: brand.fontFamily }}>
          <Link href={unsubscribeUrl} style={linkStyle}>
            Unsubscribe
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}
