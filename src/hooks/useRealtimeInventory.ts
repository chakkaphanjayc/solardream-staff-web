"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Identifiable = {
  id: string;
};

export function useRealtimeInventory<T extends Identifiable>(initialProducts: T[]) {
  const [products, setProducts] = useState(initialProducts);
  const [isReady, setIsReady] = useState(false);
  const supabase = createClient();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setProducts(initialProducts);
    setIsReady(true);
  }, [initialProducts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const channel = supabase
      .channel("product_inventory")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Product",
        },
        (payload) => {
          setProducts((current) =>
            current.map((p) =>
              p.id === payload.new.id ? ({ ...p, ...payload.new } as T) : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return { products, isReady };
}
