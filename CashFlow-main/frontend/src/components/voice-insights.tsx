import { useQuery } from "@tanstack/react-query";
import { dataApi } from "../lib/api";
import { Card } from "./ui";
import { RefreshCw, Lightbulb } from "lucide-react";
import { formatINR } from "../lib/utils";

export function VoiceInsightsCard() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["spending-insights"],
    queryFn: async () => {
      const res = await dataApi.getSpendingInsights();
      return res;
    }
  });

  const insights = data || { category_totals: {}, advice: [] };
  const categories = Object.entries(insights.category_totals || {})
    .map(([cat, val]) => `${cat}: ${formatINR(Number(val))}`)
    .join(", ");

  return (
    <Card className="border border-emerald-100 bg-emerald-50/20 shadow-sm rounded-2xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100/50 pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <div className="rounded-full bg-emerald-100 p-1.5 text-emerald-700">
              <Lightbulb className="h-4 w-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-slate-800">Voice Assistant Insights</h3>
          </div>
          <button 
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50"
            title="Refresh Insights"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {categories ? (
          <p className="text-xs font-semibold text-slate-600 mb-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            Top spent this week: <span className="text-slate-800 font-bold">{categories}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-500 italic mb-3">No category spending logged this week yet.</p>
        )}

        <div className="space-y-2">
          {insights.advice && insights.advice.length > 0 ? (
            insights.advice.map((line: string, index: number) => (
              <div key={index} className="flex items-start space-x-2 text-xs text-slate-700 leading-relaxed font-medium">
                <span className="text-emerald-500 font-bold mt-0.5">•</span>
                <span>{line}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic">Listening for voice logs to generate suggestions...</p>
          )}
        </div>
      </div>
    </Card>
  );
}
