"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { createLead } from "./actions";
import { CANONICAL_SECTORS, CANONICAL_REGIONS } from "@/lib/import/normalize";
import { STAGE_LABELS } from "@/lib/constants";
import { LeadStage } from "@prisma/client";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export function AddLeadModal({ users = [] }: { users?: UserOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    sector: "",
    city: "",
    geography: "",
    stage: "NEW" as LeadStage,
    ownerId: "",
    tags: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleOpen() {
    setError("");
    setFormData({
      firstName: "",
      lastName: "",
      company: "",
      email: "",
      phone: "",
      sector: "",
      city: "",
      geography: "",
      stage: "NEW",
      ownerId: "",
      tags: "",
    });
    setIsOpen(true);
  }

  function handleClose() {
    if (!pending) {
      setIsOpen(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.email.trim()) {
      setError("Email address is required.");
      return;
    }
    setError("");

    const tagsArray = formData.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        await createLead({
          firstName: formData.firstName,
          lastName: formData.lastName,
          company: formData.company,
          email: formData.email,
          phone: formData.phone,
          sector: formData.sector || undefined,
          city: formData.city || undefined,
          geography: formData.geography || undefined,
          stage: formData.stage,
          ownerId: formData.ownerId || null,
          tags: tagsArray,
        });
        setIsOpen(false);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to create lead.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="primary" onClick={handleOpen} className="w-full sm:w-auto">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        <span>Add Lead</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add New Lead</h3>
                <p className="text-xs text-slate-500">Manually add a single lead to your CRM pipeline.</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">First Name</label>
                  <Input
                    name="firstName"
                    placeholder="e.g. Rahul"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Last Name</label>
                  <Input
                    name="lastName"
                    placeholder="e.g. Sharma"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    name="email"
                    required
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <Input
                    name="phone"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Company</label>
                <Input
                  name="company"
                  placeholder="e.g. Apex Towers Pvt Ltd"
                  value={formData.company}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Sector</label>
                  <Select name="sector" value={formData.sector} onChange={handleChange} className="mt-1">
                    <option value="">Select sector...</option>
                    {CANONICAL_SECTORS.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">City</label>
                  <Input
                    name="city"
                    placeholder="e.g. Gurgaon / Lucknow"
                    value={formData.city}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Region / Geography</label>
                  <Select name="geography" value={formData.geography} onChange={handleChange} className="mt-1">
                    <option value="">Auto-derived or select...</option>
                    {CANONICAL_REGIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Pipeline Stage</label>
                  <Select name="stage" value={formData.stage} onChange={handleChange} className="mt-1">
                    {Object.entries(STAGE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {users.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Assigned Owner</label>
                  <Select name="ownerId" value={formData.ownerId} onChange={handleChange} className="mt-1">
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.role})
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">Tags (comma separated)</label>
                <Input
                  name="tags"
                  placeholder="e.g. Q3-Outreach, Hot-Prospect"
                  value={formData.tags}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={handleClose} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "Creating Lead…" : "Create Lead"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
