/**
 * HealthMetrics unit tests
 *
 * Drives the component through the two real-world states it exists to
 * surface — a healthy Firestore listener (snapshot delivered, zero
 * error counters) and a failing one (no snapshot, read-error count > 0)
 * — plus the auto-refresh toggle that admins use post-deploy to
 * confirm rules and queries are still working.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import HealthMetrics from '@/components/admin/HealthMetrics';

describe('HealthMetrics', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders success state: Last fetched, doc count, zero error counters', () => {
    const lastFetched = new Date(Date.now() - 3_000); // ~3s ago → "just now"
    render(
      <HealthMetrics
        lastFetched={lastFetched}
        readErrors={0}
        writeErrors={0}
        docCount={42}
        source="dsrRequests"
      />
    );

    expect(screen.getByTestId('health-metrics')).toBeInTheDocument();
    expect(screen.getByText(/Healthy/i)).toBeInTheDocument();
    expect(screen.getByTestId('health-last-fetched')).toHaveTextContent('just now');
    expect(screen.getByTestId('health-doc-count')).toHaveTextContent('42');
    expect(screen.getByTestId('health-read-errors')).toHaveTextContent('read err: 0');
    expect(screen.getByTestId('health-write-errors')).toHaveTextContent('write err: 0');
    expect(screen.getByText('dsrRequests')).toBeInTheDocument();
  });

  it('renders failure state: never fetched, read-error counter visible and emphasised', () => {
    render(
      <HealthMetrics
        lastFetched={null}
        readErrors={3}
        writeErrors={1}
        lastError="permission-denied"
        docCount={0}
      />
    );

    expect(screen.getByText(/Issues/i)).toBeInTheDocument();
    expect(screen.getByTestId('health-last-fetched')).toHaveTextContent('—');
    expect(screen.getByTestId('health-doc-count')).toHaveTextContent('0');
    const readPill = screen.getByTestId('health-read-errors');
    expect(readPill).toHaveTextContent('read err: 3');
    expect(readPill).toHaveAttribute('title', 'permission-denied');
    // Failure styling: rose-tinted error pill.
    expect(readPill.className).toMatch(/rose/);
    expect(screen.getByTestId('health-write-errors')).toHaveTextContent('write err: 1');
  });

  it('formats "Last fetched" relative time across thresholds', () => {
    const now = Date.now();
    const { rerender } = render(
      <HealthMetrics lastFetched={new Date(now - 30_000)} readErrors={0} writeErrors={0} />
    );
    expect(screen.getByTestId('health-last-fetched')).toHaveTextContent('30s ago');

    rerender(
      <HealthMetrics lastFetched={new Date(now - 5 * 60_000)} readErrors={0} writeErrors={0} />
    );
    expect(screen.getByTestId('health-last-fetched')).toHaveTextContent('5m ago');

    rerender(
      <HealthMetrics lastFetched={new Date(now - 2 * 3_600_000)} readErrors={0} writeErrors={0} />
    );
    expect(screen.getByTestId('health-last-fetched')).toHaveTextContent('2h ago');
  });

  it('renders refresh button only when onRefresh is provided and fires on click', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <HealthMetrics lastFetched={new Date()} readErrors={0} writeErrors={0} />
    );
    expect(screen.queryByTestId('health-refresh')).toBeNull();

    rerender(
      <HealthMetrics lastFetched={new Date()} readErrors={0} writeErrors={0} onRefresh={onRefresh} />
    );
    fireEvent.click(screen.getByTestId('health-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('auto-refresh toggle: OFF by default, calls onRefresh on each interval when ON', () => {
    const onRefresh = vi.fn();
    render(
      <HealthMetrics
        lastFetched={new Date()}
        readErrors={0}
        writeErrors={0}
        onRefresh={onRefresh}
        autoRefreshIntervalMs={30_000}
      />
    );

    const toggle = screen.getByTestId('health-auto-refresh-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    // OFF → ticking time must not invoke onRefresh.
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(onRefresh).not.toHaveBeenCalled();

    // Enable.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onRefresh).toHaveBeenCalledTimes(3);

    // Pause again → no further calls.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('auto-refresh respects defaultAutoRefresh and enforces a 5s minimum', () => {
    const onRefresh = vi.fn();
    render(
      <HealthMetrics
        lastFetched={new Date()}
        readErrors={0}
        writeErrors={0}
        onRefresh={onRefresh}
        defaultAutoRefresh
        // Try to set sub-minimum; component must floor at 5s.
        autoRefreshIntervalMs={1_000}
      />
    );

    expect(screen.getByTestId('health-auto-refresh-toggle')).toHaveAttribute('aria-checked', 'true');

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(onRefresh).not.toHaveBeenCalled(); // floored to 5s
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
