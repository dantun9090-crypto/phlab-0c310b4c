import * as React from "react";
import { Body, Container, Head, Html, Preview, Section } from "@react-email/components";
import type { EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
  preview?: string;
  children: React.ReactNode;
}

/**
 * Root wrapper for every branded email. Uses table-based layout via
 * react-email primitives — safe in Outlook, Gmail, Apple Mail, Yahoo.
 * Body background stays `#ffffff` compatible via brand.backgroundColor.
 */
export function EmailLayout({ brand, preview, children }: Props) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body
        style={{
          backgroundColor: brand.backgroundColor,
          margin: 0,
          padding: 0,
          fontFamily: brand.fontFamily,
          color: brand.textColor,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Section
          style={{
            backgroundColor: brand.backgroundColor,
            padding: "24px 12px",
          }}
        >
          <Container
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              backgroundColor: brand.surfaceColor,
              borderRadius: brand.buttonRadius > 0 ? `${brand.buttonRadius}px` : "0",
              overflow: "hidden",
            }}
          >
            {children}
          </Container>
        </Section>
      </Body>
    </Html>
  );
}
