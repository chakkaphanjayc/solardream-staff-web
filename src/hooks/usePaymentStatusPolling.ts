"use client";

import { useCallback, useEffect, useRef } from "react";
import { getPaymentMilestones } from "@/app/actions/payments";

interface PaymentStatusSnapshot {
  orderStatus: string;
  milestoneStatus: string | null;
}

interface UsePaymentStatusPollingOptions {
  orderId: string;
  milestoneId: string | null;
  enabled: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  onConfirmed: (snapshot: PaymentStatusSnapshot) => void;
  onTimeout?: () => void;
}

export function usePaymentStatusPolling({
  orderId,
  milestoneId,
  enabled,
  intervalMs = 1500,
  timeoutMs = 60_000,
  onConfirmed,
  onTimeout,
}: UsePaymentStatusPollingOptions) {
  const confirmedRef = useRef(false);
  const startedAtRef = useRef(0);
  const onConfirmedRef = useRef(onConfirmed);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const pollNow = useCallback(async () => {
    if (!milestoneId || confirmedRef.current) return false;

    const result = await getPaymentMilestones(orderId);
    if (!result.success || !result.order || !result.milestones) return false;

    const milestone = result.milestones.find((item) => item.id === milestoneId);
    const milestonePaid = milestone?.status === "PAID";
    const orderStatus = result.order.status.toUpperCase();

    if (milestonePaid) {
      confirmedRef.current = true;
      onConfirmedRef.current({
        orderStatus,
        milestoneStatus: milestone?.status || null,
      });
      return true;
    }

    return false;
  }, [milestoneId, orderId]);

  useEffect(() => {
    if (!enabled || !milestoneId) {
      confirmedRef.current = false;
      return;
    }

    let cancelled = false;
    confirmedRef.current = false;
    startedAtRef.current = Date.now();

    const runPoll = async () => {
      if (cancelled || confirmedRef.current) return;

      await pollNow();
      if (cancelled || confirmedRef.current) return;

      if (Date.now() - startedAtRef.current >= timeoutMs) {
        onTimeoutRef.current?.();
      }
    };

    void runPoll();
    const intervalId = window.setInterval(() => void runPoll(), intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, milestoneId, pollNow, timeoutMs]);

  return { pollNow };
}
