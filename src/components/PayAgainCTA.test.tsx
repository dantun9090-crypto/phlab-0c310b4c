import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PayAgainCTA } from './PayAgainCTA';

describe('<PayAgainCTA />', () => {
  it('renders the CTA for a pending Fena order and links to /payment?orderId=<id>', () => {
    render(
      <PayAgainCTA
        order={{ id: 'order_abc', status: 'pending', paymentProvider: 'fena' }}
      />,
    );

    expect(screen.getByTestId('pay-again-cta')).toBeInTheDocument();
    expect(screen.getByText('Payment not completed')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /pay again/i });
    expect(link).toHaveAttribute('href', '/payment?orderId=order_abc');
  });

  it('renders for pending_payment Pay-by-Bank orders', () => {
    render(
      <PayAgainCTA
        order={{ id: 'order_pbb', status: 'pending_payment', paymentMethod: 'pay_by_bank' }}
      />,
    );

    const link = screen.getByRole('link', { name: /pay again/i });
    expect(link).toHaveAttribute('href', '/payment?orderId=order_pbb');
  });

  it('renders for cancelled Fena orders (user cancelled at bank — still payable)', () => {
    render(
      <PayAgainCTA
        order={{ id: 'order_cxl', status: 'cancelled', paymentProvider: 'fena' }}
      />,
    );

    expect(screen.getByTestId('pay-again-cta')).toBeInTheDocument();
  });

  it('does NOT render for paid orders', () => {
    const { container } = render(
      <PayAgainCTA
        order={{ id: 'order_paid', status: 'paid', paymentProvider: 'fena' }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does NOT render for admin-cancelled orders without a retryable provider', () => {
    const { container } = render(
      <PayAgainCTA order={{ id: 'order_admin', status: 'cancelled' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does NOT render for manual bank_transfer orders', () => {
    const { container } = render(
      <PayAgainCTA
        order={{ id: 'order_bt', status: 'pending', paymentMethod: 'bank_transfer' }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('URL-encodes order ids with reserved characters', () => {
    render(
      <PayAgainCTA
        order={{ id: 'a b/c', status: 'pending', paymentProvider: 'fena' }}
      />,
    );
    expect(screen.getByRole('link', { name: /pay again/i })).toHaveAttribute(
      'href',
      '/payment?orderId=a%20b%2Fc',
    );
  });
});
