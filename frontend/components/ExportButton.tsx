"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ChevronDown,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileCode,
  Printer,
  Clipboard,
  Globe,
  Code,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { hasPermission } from "@/lib/auth";
import { ExportService, ExportColumn } from "@/lib/ExportService";

interface ExportButtonProps {
  title: string;
  filename: string;
  columns: ExportColumn[];
  data: any[];
  isDocument?: boolean;
  documentData?: any;
  pdfUrl?: string;
  requiredPermission?: string;
  className?: string;
}

type FormatOption = {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: "file" | "cloud" | "action";
};

const FORMATS: FormatOption[] = [
  {
    id: "pdf",
    name: "PDF Document (.pdf)",
    description: "High-fidelity, printable PDF layout",
    icon: FileText,
    category: "file",
  },
  {
    id: "docx",
    name: "Word Document (.docx)",
    description: "Microsoft Word compatible editable document",
    icon: FileText,
    category: "file",
  },
  {
    id: "xlsx",
    name: "Excel Workbook (.xlsx)",
    description: "Microsoft Excel tabular spreadsheet with styling",
    icon: FileSpreadsheet,
    category: "file",
  },
  {
    id: "csv",
    name: "CSV File (.csv)",
    description: "Standard comma-separated plain text data",
    icon: FileSpreadsheet,
    category: "file",
  },
  {
    id: "gdocs",
    name: "Google Docs",
    description: "Open or import formatted document in Google Docs",
    icon: Globe,
    category: "cloud",
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    description: "Open or import structured table in Google Sheets",
    icon: Globe,
    category: "cloud",
  },
  {
    id: "json",
    name: "JSON File (.json)",
    description: "Raw structured JSON data",
    icon: Code,
    category: "file",
  },
  {
    id: "xml",
    name: "XML File (.xml)",
    description: "Standard XML formatted schema",
    icon: FileCode,
    category: "file",
  },
  {
    id: "print",
    name: "Print View",
    description: "Open standard print-preview page",
    icon: Printer,
    category: "action",
  },
  {
    id: "clipboard",
    name: "Copy to Clipboard",
    description: "Copy TSV/Summary data to clipboard",
    icon: Clipboard,
    category: "action",
  },
];

export default function ExportButton({
  title,
  filename,
  columns,
  data,
  isDocument = false,
  documentData,
  pdfUrl,
  requiredPermission,
  className = "",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Mounted check for Next.js SSR / Hydration mismatch safety
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Google Workspace Dialog State
  const [googleWorkspaceModal, setGoogleWorkspaceModal] = useState<{
    open: boolean;
    format: "Docs" | "Sheets";
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic positioning coords
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Gating access purely cosmetics/frontend verification. Backend enforces real permissions.
  const [authorized, setAuthorized] = useState(true);
  useEffect(() => {
    if (requiredPermission) {
      setAuthorized(hasPermission(requiredPermission));
    }
  }, [requiredPermission]);

  // Click outside to close dropdown (handles Portal DOM structure)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger =
        triggerRef.current && triggerRef.current.contains(target);
      const clickedPortal =
        portalRef.current && portalRef.current.contains(target);
      if (!clickedTrigger && !clickedPortal) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Position calculation routine
  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = 320; // Width of w-80 is 320px

    // Right-aligned relative to the trigger button
    let left = rect.right + window.scrollX - dropdownWidth;

    // Safety check for mobile: shift left if it overflows left edge
    if (left < 8) {
      left = Math.max(8, rect.left + window.scrollX);
    }

    // Clamp to right edge of window to avoid page layout overflow
    const maxLeft = window.innerWidth + window.scrollX - dropdownWidth - 16;
    if (left > maxLeft) {
      left = maxLeft;
    }

    setCoords({
      top: rect.bottom + window.scrollY + 8,
      left: left,
    });
  };

  // Recalculate positions on events
  useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener("resize", updateCoords);
      window.addEventListener("scroll", updateCoords, true); // capture scrolls from overflow containers
    }
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [open]);

  if (!authorized) return null;

  const triggerToast = (msg: string, error = false) => {
    setIsError(error);
    setStatusMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setStatusMsg(null);
    }, 4000);
  };

  const handleExport = async (formatId: string) => {
    setOpen(false);

    // Google Workspace exports require showing a specialized configuration guide dialog.
    if (formatId === "gdocs" || formatId === "gsheets") {
      setGoogleWorkspaceModal({
        open: true,
        format: formatId === "gdocs" ? "Docs" : "Sheets",
      });
      return;
    }

    try {
      setExporting(true);
      setProgress(0);

      const resolvedParams = {
        title,
        filename,
        columns,
        data,
        isDocument,
        documentData: documentData || (isDocument ? data[0] : null),
        pdfUrl,
      };

      await ExportService.export(formatId, resolvedParams, (p) => {
        setProgress(p);
      });

      triggerToast(`${formatId.toUpperCase()} export completed successfully.`);
    } catch (err: any) {
      triggerToast(err?.message || "Export process failed.", true);
    } finally {
      setExporting(false);
    }
  };

  const handleGoogleWorkspaceDownload = async () => {
    if (!googleWorkspaceModal) return;
    const format = googleWorkspaceModal.format;
    setGoogleWorkspaceModal(null);

    const isSheets = format === "Sheets";
    const extension = isSheets ? "xlsx" : "docx";

    try {
      setExporting(true);
      setProgress(0);

      const resolvedParams = {
        title,
        filename: `${filename}_GoogleCompatible`,
        columns,
        data,
        isDocument,
        documentData: documentData || (isDocument ? data[0] : null),
      };

      await ExportService.export(extension, resolvedParams, (p) =>
        setProgress(p),
      );
      triggerToast(`Google-compatible file downloaded successfully.`);
    } catch (err: any) {
      triggerToast("Failed to generate Google compatible file.", true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Toast Notification */}
      {statusMsg && (
        <div className="fixed bottom-5 right-5 z-[9999] flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium shadow-xl animate-fade-in bg-white dark:bg-[#2C2C2E] border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200">
          {isError ? (
            <AlertCircle className="text-red-500" size={16} />
          ) : (
            <Check className="text-emerald-500" size={16} />
          )}
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={exporting}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "flex items-center gap-2 rounded-lg border border-[var(--separator-soft)] px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
          exporting
            ? "bg-[var(--bg-subtle)] text-[var(--text-secondary)] cursor-not-allowed"
            : "bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] shadow-sm",
          className,
        ].join(" ")}
      >
        {exporting ? (
          <Loader2 className="animate-spin text-blue-500" size={14} />
        ) : (
          <Download size={14} className="text-[var(--text-secondary)]" />
        )}
        <span>{exporting ? `Exporting (${progress}%)` : "Export"}</span>
        <ChevronDown
          size={12}
          className="opacity-60 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {/* Progress Bar (Attached below button when exporting) */}
      {exporting && (
        <div className="absolute left-0 right-0 mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2C2C2E]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Dropdown Menu (Rendered via Portal to bypass stacking context and parent clipping) */}
      {open &&
        mounted &&
        createPortal(
          <div
            ref={portalRef}
            style={{
              position: "absolute",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className="z-[9999] w-80 rounded-xl border border-[var(--separator)] bg-[var(--bg-elevated)] p-2 shadow-2xl animate-fade-in focus:outline-none dark:bg-[#1C1C1E] dark:border-gray-800"
          >
            <div className="px-3 py-1.5 border-b border-[var(--separator-soft)] mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Enterprise Export Center
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-0.5">
              {FORMATS.map((f) => {
                const IconComp = f.icon;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleExport(f.id)}
                    className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--bg-subtle)] focus:bg-[var(--bg-subtle)] focus:outline-none dark:hover:bg-[#2C2C2E]"
                  >
                    <div className="mt-0.5 rounded bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <IconComp size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">
                        {f.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)] truncate leading-snug">
                        {f.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}

      {/* Google Workspace Modal Guide (Rendered via Portal for safety) */}
      {googleWorkspaceModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md rounded-2xl border border-[var(--separator)] bg-[var(--bg-elevated)] p-6 shadow-2xl dark:bg-[#1C1C1E] dark:border-gray-800 animate-scale-in">
              <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                Google {googleWorkspaceModal.format} Export
              </h3>
              <p className="mt-2.5 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                We generate your documents in standardized, clean formats
                compatible directly with Google Drive. You can download the
                Google-ready file or upload it directly:
              </p>

              <div className="mt-4 rounded-xl bg-blue-500/5 border border-blue-500/10 p-3.5 text-[12px] text-[var(--text-secondary)] space-y-1.5">
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  Instructions:
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Click <strong>Download Google-compatible File</strong>.
                  </li>
                  <li>Open your Google Drive dashboard.</li>
                  <li>
                    Drag and drop the downloaded file to convert it
                    automatically.
                  </li>
                </ol>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setGoogleWorkspaceModal(null)}
                  className="rounded-lg border border-[var(--separator-soft)] bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  Cancel
                </button>

                <a
                  href={
                    googleWorkspaceModal.format === "Docs"
                      ? "https://docs.google.com"
                      : "https://sheets.google.com"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--separator-soft)] bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  <span>Open Google {googleWorkspaceModal.format}</span>
                  <ExternalLink size={12} />
                </a>

                <button
                  type="button"
                  onClick={handleGoogleWorkspaceDownload}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-blue-700 shadow-sm"
                >
                  Download Google File
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
