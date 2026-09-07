import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trophy, Clock, Wallet, Plus, AlertTriangle } from "lucide-react";
import { formatINR, calcPlatformFee, calcTotalCost, DEADLINE_OPTIONS } from "@/lib/contest-utils";
import AddFundsModal from "@/components/AddFundsModal";

export default function Step3PrizeDeadline({ data, update, onNext, onBack, balance, onFundsChange }) {
  const [showAddFunds, setShowAddFunds] = useState(false);
  const prize = Number(data.prize_amount) || 0;
  const fee = calcPlatformFee(prize);
  const total = calcTotalCost(prize);
  const sufficient = balance >= total;
  const remaining = balance - total;

  const setDeadlineFromOption = (hours) => {
    const dt = new Date(Date.now() + hours * 60 * 60 * 1000);
    update("deadline", dt.toISOString());
  };

  return (
    <div className="space-y-6">
      {/* Prize Amount */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <Trophy className="w-4 h-4" style={{ color: "hsl(var(--money))" }} />
          Prize Amount <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground font-bold text-lg">₹</span>
          <input
            type="number"
            value={data.prize_amount || ""}
            onChange={(e) => update("prize_amount", e.target.value)}
            placeholder="2,000"
            className="w-full pl-9 pr-4 py-3 rounded-xl bg-input border border-border text-foreground text-xl font-bold placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-2.5">
          {[500, 1000, 2000, 5000, 10000].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => update("prize_amount", amt)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground transition-all"
            >
              {formatINR(amt)}
            </button>
          ))}
        </div>
      </div>

      {/* Contest Deadline */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <Clock className="w-4 h-4 text-primary" />
          Contest Deadline <span className="text-destructive">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {DEADLINE_OPTIONS.map((opt) => {
            const isActive = data.deadline && new Date(Date.now() + opt.hours * 60 * 60 * 1000).toISOString() === data.deadline;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDeadlineFromOption(opt.hours)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">Or choose a custom date & time:</p>
          <input
            type="datetime-local"
            value={data.deadline ? new Date(data.deadline).toISOString().slice(0, 16) : ""}
            onChange={(e) => update("deadline", new Date(e.target.value).toISOString())}
            className="px-4 py-2.5 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
      </div>

      {/* Payment Summary */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-accent/30">
          <h4 className="text-sm font-semibold text-foreground">Payment Summary</h4>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prize Amount</span>
            <span className="font-medium text-foreground">{formatINR(prize)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform Fee (10%)</span>
            <span className="font-medium text-foreground">{formatINR(fee)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="font-semibold text-foreground">Total Cost</span>
            <span className="font-bold text-foreground text-lg">{formatINR(total)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Wallet className="w-3.5 h-3.5" /> Available Balance
            </span>
            <span className={`font-semibold ${sufficient ? "text-green-400" : "text-destructive"}`}>{formatINR(balance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining After Publishing</span>
            <span className={`font-semibold ${remaining >= 0 ? "text-foreground" : "text-destructive"}`}>{formatINR(remaining)}</span>
          </div>
        </div>
      </div>

      {/* Insufficient Funds Warning */}
      {!sufficient && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Insufficient Balance</p>
            <p className="text-xs text-muted-foreground">You need {formatINR(Math.abs(remaining))} more to publish this contest.</p>
          </div>
          <Button size="sm" onClick={() => setShowAddFunds(true)} className="shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add to Wallet
          </Button>
        </div>
      )}

      <AddFundsModal
        open={showAddFunds}
        onClose={() => setShowAddFunds(false)}
        onAdded={() => onFundsChange?.()}
        currentBalance={balance}
      />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!prize || !data.deadline || !sufficient} className="px-8">Continue</Button>
      </div>
    </div>
  );
}