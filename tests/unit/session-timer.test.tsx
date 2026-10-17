// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRemaining, SessionTimer } from "@/components/conversation/SessionTimer";

describe("SessionTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("is hidden before 13:00, shows a countdown after, and ends the session at 15:00", () => {
    const onCap = vi.fn();
    const capEndsAt = 15 * 60_000;
    render(<SessionTimer capEndsAt={capEndsAt} active onCap={onCap} />);
    expect(screen.queryByRole("timer")).toBeNull();

    act(() => vi.advanceTimersByTime(13 * 60_000 + 1000));
    expect(screen.getByRole("timer").textContent).toBe("Session ends in 1:59");

    act(() => vi.advanceTimersByTime(119_000));
    expect(onCap).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when inactive", () => {
    render(<SessionTimer capEndsAt={1000} active={false} onCap={() => undefined} />);
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("formats remaining time", () => {
    expect(formatRemaining(61_000)).toBe("1:01");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});
