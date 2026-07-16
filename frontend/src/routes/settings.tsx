import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";
import { PageHeader } from "../components/page-header";
import { User, Briefcase, Bell, CheckCircle2, AlertCircle, Sliders, Globe, Coins, ShieldCheck } from "lucide-react";

export const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings",
  component: SettingsPage
});

interface ProfileData {
  name: string;
  display_name: string;
  email: string;
  phone_number: string;
  business_name: string;
  gst_number: string;
  preferred_currency: string;
  default_financial_year_start_month: string;
  email_alerts_bills: boolean;
  email_alerts_gst: boolean;
  email_alerts_reminders: boolean;
}

const initialFormState: ProfileData = {
  name: "",
  display_name: "",
  email: "",
  phone_number: "",
  business_name: "",
  gst_number: "",
  preferred_currency: "INR",
  default_financial_year_start_month: "April",
  email_alerts_bills: true,
  email_alerts_gst: true,
  email_alerts_reminders: true
};

function SettingsPage() {
  const [form, setForm] = useState<ProfileData>(initialFormState);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"profile" | "business" | "notifications">("profile");

  // Fetch profile settings
  const { data: fetchedProfile, refetch, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await dataApi.getProfile();
      return res as ProfileData;
    }
  });

  // Pre-fill form when data is loaded
  useEffect(() => {
    if (fetchedProfile) {
      setForm(fetchedProfile);
    }
  }, [fetchedProfile]);

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: (updatedData: ProfileData) => dataApi.updateProfile(updatedData),
    onSuccess: (data) => {
      setSuccessMessage("Settings saved successfully!");
      setValidationError(null);
      setForm(data);
      refetch();
      // Hide success message after 4 seconds
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setValidationError(err.message || "Failed to save profile changes. Please try again.");
      setSuccessMessage(null);
    }
  });

  const validateForm = (): boolean => {
    if (!form.name.trim()) {
      setValidationError("Full Name is required.");
      return false;
    }
    if (!form.email.trim()) {
      setValidationError("Email Address is required.");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      setValidationError("Please enter a valid email address.");
      return false;
    }
    return true;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSuccessMessage(null);
    
    if (validateForm()) {
      updateMutation.mutate(form);
    }
  };

  const handleCancel = () => {
    if (fetchedProfile) {
      setForm(fetchedProfile);
    } else {
      setForm(initialFormState);
    }
    setValidationError(null);
    setSuccessMessage(null);
  };

  const scrollToSection = (id: string, section: "profile" | "business" | "notifications") => {
    setActiveSection(section);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const userInitials = form.name
    ? form.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : form.display_name
    ? form.display_name.substring(0, 2).toUpperCase()
    : "CG";

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent border-teal-600"></div>
        <span className="ml-3 font-semibold text-slate-600">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Settings" 
        blurb="Manage your personal details, business info, tax settings, and compliance notification preferences." 
      />

      {/* Message Banners */}
      {successMessage && (
        <div className="p-4 bg-teal-50 border border-teal-200 text-teal-800 rounded-[20px] flex items-center space-x-3 text-sm animate-fade-in shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-teal-600 flex-shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {validationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-[20px] flex items-center space-x-3 text-sm animate-fade-in shadow-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
          <span className="font-semibold">{validationError}</span>
        </div>
      )}

      {/* Responsive Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sticky Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <Card className="p-5 flex flex-col items-center text-center rounded-3xl border border-slate-200/60 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              {/* Profile Avatar Initials Bubble */}
              <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-teal-500 to-blue-500 text-white flex items-center justify-center font-display text-2xl font-bold shadow-md shadow-teal-500/10">
                {userInitials}
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-slate-800">
                {form.display_name || form.name || "User Profile"}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-full truncate">
                {form.email}
              </p>

              {/* Sidebar Quick Links */}
              <div className="w-full mt-6 pt-4 border-t border-slate-100 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => scrollToSection("profile-card", "profile")}
                  className={`flex w-full items-center space-x-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                    activeSection === "profile"
                      ? "bg-slate-100 text-teal-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>Profile Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("business-card", "business")}
                  className={`flex w-full items-center space-x-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                    activeSection === "business"
                      ? "bg-slate-100 text-teal-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span>Business Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("notifications-card", "notifications")}
                  className={`flex w-full items-center space-x-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                    activeSection === "notifications"
                      ? "bg-slate-100 text-teal-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Bell className="h-4 w-4 shrink-0" />
                  <span>Notification Alerts</span>
                </button>
              </div>
            </Card>
          </div>
        </div>

        {/* Form Sections */}
        <div className="lg:col-span-3">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Card 1: Profile Settings */}
            <div id="profile-card">
              <Card className="grid gap-5 rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition-shadow duration-300">
                <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                  <div className="rounded-2xl bg-teal-50 p-2.5 text-teal-700 shadow-sm">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-800">Profile Settings</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Your personal identity and workspace contact details</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full Name *">
                    <Input 
                      value={form.name} 
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Rahul Sharma"
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all"
                    />
                  </Field>

                  <Field label="Display Name">
                    <Input 
                      value={form.display_name} 
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder="e.g. Rahul"
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all"
                    />
                  </Field>

                  <Field label="Email Address *">
                    <Input 
                      type="email"
                      value={form.email} 
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="name@company.com"
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all"
                    />
                  </Field>

                  <Field label="Phone Number">
                    <Input 
                      type="tel"
                      value={form.phone_number} 
                      onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all"
                    />
                  </Field>
                </div>
              </Card>
            </div>

            {/* Card 2: Business Info */}
            <div id="business-card">
              <Card className="grid gap-5 rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition-shadow duration-300">
                <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                  <div className="rounded-2xl bg-blue-50 p-2.5 text-blue-700 shadow-sm">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-800">Business Details</h3>
                    <p className="text-xs text-slate-500 mt-0.5">GSTIN compliance status and core ledger default configurations</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business / Shop Name">
                    <Input 
                      value={form.business_name} 
                      onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                      placeholder="e.g. Sharma Wholesale Stores"
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all"
                    />
                  </Field>

                  <Field label="GSTIN (15-character GST Number)">
                    <Input 
                      value={form.gst_number} 
                      onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })}
                      placeholder="e.g. 36AAAAA1111A1Z1"
                      maxLength={15}
                      className="hover:border-teal-300 focus:border-teal-500 focus:ring focus:ring-teal-100 transition-all font-mono"
                    />
                  </Field>

                  <Field label="Preferred Currency">
                    <div className="relative">
                      <select
                        className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-4 text-slate-950 outline-none ring-0 transition hover:border-teal-300 focus:border-teal-500 focus:shadow-[0_0_0_3px_hsla(154,77%,28%,0.12)] cursor-pointer appearance-none"
                        value={form.preferred_currency}
                        onChange={(e) => setForm({ ...form, preferred_currency: e.target.value })}
                      >
                        <option value="INR">INR (₹) - Indian Rupee</option>
                        <option value="USD">USD ($) - US Dollar</option>
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="GBP">GBP (£) - British Pound</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <Coins className="h-4 w-4" />
                      </div>
                    </div>
                  </Field>

                  <Field label="Financial Year Starts In">
                    <div className="relative">
                      <select
                        className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-4 text-slate-950 outline-none ring-0 transition hover:border-teal-300 focus:border-teal-500 focus:shadow-[0_0_0_3px_hsla(154,77%,28%,0.12)] cursor-pointer appearance-none"
                        value={form.default_financial_year_start_month}
                        onChange={(e) => setForm({ ...form, default_financial_year_start_month: e.target.value })}
                      >
                        <option value="January">January</option>
                        <option value="April">April (Standard India FY)</option>
                        <option value="July">July</option>
                        <option value="October">October</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <Globe className="h-4 w-4" />
                      </div>
                    </div>
                  </Field>
                </div>
              </Card>
            </div>

            {/* Card 3: Notifications Preferences */}
            <div id="notifications-card">
              <Card className="grid gap-5 rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition-shadow duration-300">
                <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                  <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-700 shadow-sm">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-800">Notification Preferences</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Control email updates and security alerts for your shop audits</p>
                  </div>
                </div>

                <div className="grid gap-4 py-2">
                  <label className="flex items-start space-x-4 cursor-pointer group select-none py-2 px-3 rounded-2xl hover:bg-slate-50/50 transition">
                    <input 
                      type="checkbox"
                      checked={form.email_alerts_bills}
                      onChange={(e) => setForm({ ...form, email_alerts_bills: e.target.checked })}
                      className="h-5 w-5 rounded-lg border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700 transition flex items-center gap-1.5">
                        Email alerts for suspicious bills
                        <ShieldCheck className="h-4 w-4 text-teal-600" />
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">Receive immediate notifications when uploaded vendor invoices fail validation or suggest fake numbers.</p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-4 cursor-pointer group select-none border-t border-slate-100 pt-4 py-2 px-3 rounded-2xl hover:bg-slate-50/50 transition">
                    <input 
                      type="checkbox"
                      checked={form.email_alerts_gst}
                      onChange={(e) => setForm({ ...form, email_alerts_gst: e.target.checked })}
                      className="h-5 w-5 rounded-lg border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700 transition">Email updates for GST filings & discrepancies</span>
                      <p className="text-xs text-slate-500 mt-0.5">Weekly summaries of taxable transactions and discrepancies in counters counterparty GSTINs.</p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-4 cursor-pointer group select-none border-t border-slate-100 pt-4 py-2 px-3 rounded-2xl hover:bg-slate-50/50 transition">
                    <input 
                      type="checkbox"
                      checked={form.email_alerts_reminders}
                      onChange={(e) => setForm({ ...form, email_alerts_reminders: e.target.checked })}
                      className="h-5 w-5 rounded-lg border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700 transition">Email alerts for due date reminders</span>
                      <p className="text-xs text-slate-500 mt-0.5">Receive reminders 24 hours before customer payments, supplier invoices, or compliance dates are due.</p>
                    </div>
                  </label>
                </div>
              </Card>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex min-h-12 items-center justify-center rounded-xl px-8 text-sm font-bold border border-slate-200 bg-white text-slate-500 hover:text-slate-800 shadow-sm transition hover:bg-slate-50 hover:-translate-y-0.5"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-teal-700 hover:bg-teal-800 text-white font-extrabold px-10 shadow-lg shadow-teal-700/10"
              >
                {updateMutation.isPending ? "Saving changes..." : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
