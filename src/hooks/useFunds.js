import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useFunds(refetchKey = 0) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    try {
      const funds = await base44.entities.Fund.list("-created_date", 200);
      setTransactions(funds);
      const bal = funds.reduce((acc, f) => {
        if (f.type === "added" || f.type === "released") return acc + (f.amount || 0);
        if (f.type === "reserved") return acc - (f.amount || 0);
        return acc;
      }, 0);
      setBalance(bal);
    } catch (err) {
      console.error("Failed to fetch funds", err);
    } finally {
      setLoading(false);
    }
  }, [refetchKey]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  return { transactions, loading, balance, refetch: fetchFunds };
}