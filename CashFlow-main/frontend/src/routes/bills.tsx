import { createRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { Card } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const billsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "bills",
  component: BillsPage
});

interface BillData {
  id: string;
  vendor: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  gstin: string | null;
  gst_amount: number;
  flagged: boolean;
  flag_reasons?: string;
  created_at: string;
  status?: string;
  reasons?: string[];
}

function BillsPage() {
  const [selectedBill, setSelectedBill] = useState<BillData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const response = await dataApi.query("bills", {
        sort: [{ field: "created_at", direction: "desc" }]
      });
      return response.data as unknown as BillData[];
    }
  });

  const handleUpload = async (file: File) => {
    setAnalyzing(true);
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await dataApi.analyzeAndSaveBill(String(reader.result));
        
        let reasonsList: string[] = [];
        if (response.reasons) {
          reasonsList = response.reasons;
        } else if (response.flag_reasons) {
          try {
            reasonsList = JSON.parse(response.flag_reasons);
          } catch {
            reasonsList = [];
          }
        }

        const newBill: BillData = {
          ...response,
          reasons: reasonsList
        };

        setSelectedBill(newBill);
        
        // Refetch query to update list and totals across all pages
        await refetch();
        // Also invalidate other queries like dashboard so they update automatically
        queryClient.invalidateQueries();
      } catch (err: any) {
        console.error(err);
        setUploadError(err.message || "Failed to analyze bill. Please try again.");
      } finally {
        setAnalyzing(false);
        // Reset file input value so uploading the same file again works
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectHistoryBill = (bill: BillData) => {
    let reasonsList: string[] = [];
    if (bill.reasons) {
      reasonsList = bill.reasons;
    } else if (bill.flag_reasons) {
      try {
        reasonsList = JSON.parse(bill.flag_reasons);
      } catch {
        reasonsList = [];
      }
    }
    
    setSelectedBill({
      ...bill,
      reasons: reasonsList
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Smart Bills Manager" 
        blurb="Scan, store, and verify vendor invoices. Fake bill detection runs automatically, and matching expense transactions are updated instantly." 
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload and Active Analysis Panel */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upload card */}
          <Card className="relative overflow-hidden border-dashed border-slate-300 hover:border-[hsl(var(--primary))] transition-all bg-slate-50/50 p-6 flex flex-col justify-center items-center group">
            {analyzing && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center text-white z-10 transition-all">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent border-[hsl(var(--primary-foreground))]"></div>
                <p className="mt-4 font-semibold text-lg animate-pulse">Analyzing bill with AI Guardian...</p>
                <p className="text-sm opacity-80 mt-1">Extracting items, verifying GSTIN, and updating books</p>
              </div>
            )}

            <label className="flex w-full min-h-[160px] cursor-pointer flex-col items-center justify-center text-center p-4">
              <div className="p-4 bg-emerald-100/80 rounded-full text-emerald-700 group-hover:scale-110 transition-transform duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <span className="font-display text-lg font-bold text-slate-800 mt-4">Upload Invoice Image</span>
              <span className="mt-2 text-sm text-slate-500 max-w-sm">
                Take a photo or choose a file (PNG or JPG) from your device.
              </span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} 
              />
            </label>
          </Card>

          {/* Error Message */}
          {uploadError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center space-x-3 text-sm animate-fade-in">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{uploadError}</span>
            </div>
          )}

          {/* Current Bill Details card */}
          {selectedBill && (
            <Card className={`border-t-4 transition-all duration-300 ${selectedBill.flagged ? "border-t-rose-500" : "border-t-emerald-500"} shadow-lg rounded-2xl`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-800">
                    {selectedBill.vendor || "Unknown Vendor"}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Invoice #{selectedBill.bill_number || "N/A"}
                  </p>
                </div>
                <div className="mt-3 sm:mt-0">
                  <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    selectedBill.flagged 
                      ? "bg-rose-50 text-rose-700 border border-rose-200" 
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}>
                    <span className={`h-2 w-2 rounded-full mr-2 ${selectedBill.flagged ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`}></span>
                    {selectedBill.flagged ? "Fake Bill Suspected" : "Looks OK"}
                  </span>
                </div>
              </div>

              {/* Data Fields */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-900 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Amount</p>
                  <p className="mt-1 font-display font-bold truncate text-lg text-emerald-400">₹ {(selectedBill.total_amount || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GSTIN (Vendor)</p>
                  <p className="mt-1 font-display font-bold truncate text-slate-800">{selectedBill.gstin || "Not Provided"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bill Date</p>
                  <p className="mt-1 font-display font-bold truncate text-slate-800">{selectedBill.bill_date || "Not Provided"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GST Paid</p>
                  <p className="mt-1 font-display font-bold truncate text-slate-800">{selectedBill.gst_amount ? `₹ ${selectedBill.gst_amount.toLocaleString("en-IN")}` : "₹ 0"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
                  <p className="mt-1 font-display font-bold truncate text-slate-800">{selectedBill.flagged ? "Flagged / Review needed" : "Safe & Saved"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auto-Expense Log</p>
                  <p className="mt-1 font-display font-bold truncate text-slate-800">Linked (Purchases)</p>
                </div>
              </div>

              {/* Warnings / Flag Reasons */}
              {selectedBill.flagged && selectedBill.reasons && selectedBill.reasons.length > 0 && (
                <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-900 text-sm">
                  <p className="font-bold flex items-center space-x-2 text-rose-800 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>Verification Alerts:</span>
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-rose-700">
                    {selectedBill.reasons.map((reason, idx) => (
                      <li key={idx} className="font-medium">{reason}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-semibold text-rose-500">
                    Verification Note: Shop owners are advised to check the paper bill before making full payment or claiming ITC.
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* History Panel */}
        <div className="lg:col-span-1">
          <Card className="flex flex-col h-full min-h-[400px]">
            <div className="border-b border-slate-100 pb-4 mb-4">
              <h3 className="font-display text-lg font-bold text-slate-800">Saved Bills History</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click any bill to view details & alerts</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 max-h-[500px] pr-1">
              {!data || data.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto opacity-30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                  </svg>
                  <span>No bills uploaded yet</span>
                </div>
              ) : (
                data.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => handleSelectHistoryBill(bill)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm cursor-pointer border transition-all ${
                      selectedBill?.id === bill.id
                        ? "bg-emerald-50/50 border-emerald-500/35 shadow-sm"
                        : "bg-slate-50/70 border-slate-100 hover:bg-slate-100/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="font-semibold text-slate-800 truncate">{bill.vendor || "Unknown Vendor"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {bill.bill_date || "No date"} • #{bill.bill_number ? bill.bill_number.substring(0, 12) : "N/A"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-slate-800">
                        ₹{(bill.total_amount || 0).toLocaleString("en-IN")}
                      </p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 uppercase ${
                        bill.flagged 
                          ? "bg-rose-50 text-rose-600 border border-rose-200" 
                          : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      }`}>
                        {bill.flagged ? "Suspicious" : "OK"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
      
      {/* Detailed Table for Desktop/Tablet */}
      {data && data.length > 0 && (
        <Card className="hidden md:block">
          <h3 className="font-display text-base font-bold text-slate-800 mb-4">Detailed Bills Audit Table</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Bill Number</th>
                  <th className="py-3 px-4">GSTIN</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((bill) => (
                  <tr 
                    key={bill.id}
                    className={`hover:bg-slate-50/50 transition-colors ${
                      selectedBill?.id === bill.id ? "bg-emerald-50/20" : ""
                    }`}
                  >
                    <td className="py-3.5 px-4 text-slate-600 font-medium">{bill.bill_date || "N/A"}</td>
                    <td className="py-3.5 px-4 text-slate-900 font-semibold">{bill.vendor || "Unknown Vendor"}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">{bill.bill_number || "N/A"}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">{bill.gstin || "N/A"}</td>
                    <td className="py-3.5 px-4 text-slate-900 font-bold">₹{(bill.total_amount || 0).toLocaleString("en-IN")}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        bill.flagged 
                          ? "bg-rose-50 text-rose-700" 
                          : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {bill.flagged ? "Fake bill suspected" : "Looks OK"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleSelectHistoryBill(bill)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-bold hover:underline"
                      >
                        Inspect Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
