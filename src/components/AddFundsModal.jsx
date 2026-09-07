import React, { useState } from "react";
import { Wallet, X, ArrowRight, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatINR } from "@/lib/contest-utils";

export default function AddFundsModal({ open, onClose, onAdded, currentBalance }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const quickAmounts = [500, 1000, 2000, 5000, 10000];

  const handleAdd = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    try {
      await base44.entities.Fund.create({
        amount: amt,
        type: "added",
        description: `Wallet top-up`,
      });
      setSuccess(true);
      setTimeout(() => {
        onAdded?.();
        setSuccess(false);
        setAmount("");
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
        {success ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Wallet Funded!</h3>
            <p className="text-sm text-muted-foreground">{formatINR(amount)} has been added to your account.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Wallet className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Add to Wallet</h3>
                  <p className="text-xs text-muted-foreground">Current: {formatINR(currentBalance)}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enter Amount (₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-2xl font-bold placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(String(amt))}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-foreground border border-border hover:border-primary/40 transition-all"
                  >
                    +{formatINR(amt)}
                  </button>
                ))}
              </div>

              <button
                onClick={handleAdd}
                disabled={!amount || Number(amount) <= 0 || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Processing...</>
                ) : (
                  <>Add {amount ? formatINR(amount) : "to Wallet"} <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}