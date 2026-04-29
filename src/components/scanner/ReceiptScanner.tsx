'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Camera, Loader2, FileText, AlertCircle } from 'lucide-react';

interface ScannedReceipt {
  id: string;
  image_url: string;
  provider_name: string | null;
  amount: number | null;
  receipt_date: string | null;
  receipt_type: string | null;
  extracted_data: Record<string, unknown>;
  line_items?: Array<{ description: string; amount: number }>;
  reference_number?: string | null;
}

interface ReceiptScannerProps {
  open: boolean;
  onClose: () => void;
  onScanComplete: (receipt: ScannedReceipt) => void;
}

const SCANNING_TIPS = [
  'Tip: Flat, well-lit images work best',
  'Tip: Make sure the full receipt is visible',
  'Tip: Receipts with clear print scan faster',
  'Tip: Both digital and paper receipts work',
  'Tip: We can read invoices, bills, and statements too',
  'Tip: UK consumer law gives you strong rights on overcharges',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ReceiptScanner({ open, onClose, onScanComplete }: ReceiptScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTipRotation = useCallback(() => {
    tipIntervalRef.current = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % SCANNING_TIPS.length);
    }, 3000);
  }, []);

  const stopTipRotation = useCallback(() => {
    if (tipIntervalRef.current) {
      clearInterval(tipIntervalRef.current);
      tipIntervalRef.current = null;
    }
  }, []);

  const handleFile = async (file: File) => {
    setError(null);

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPEG, PNG, WebP, or PDF file.');
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }

    setScanning(true);
    setTipIndex(0);
    startTipRotation();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/receipts/scan', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Scan failed. Please try again.');
        return;
      }

      onScanComplete(data);
      onClose();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setScanning(false);
      stopTipRotation();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={() => { if (!scanning) onClose(); }}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-all"
          disabled={scanning}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center">
            <Camera className="h-5 w-5 text-mint-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Scan Receipt or Bill</h3>
            <p className="text-slate-400 text-sm">Upload or take a photo to extract details</p>
          </div>
        </div>

        {scanning ? (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 text-mint-400 animate-spin mx-auto mb-4" />
            <p className="text-white font-semibold mb-2">Scanning your receipt...</p>
            <p className="text-slate-400 text-sm transition-opacity duration-500">
              {SCANNING_TIPS[tipIndex]}
            </p>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-mint-400 bg-mint-400/5'
                  : 'border-navy-600 hover:border-mint-400/50 hover:bg-navy-800/50'
              }`}
            >
              <Upload className="h-10 w-10 text-slate-500 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">
                Drop your receipt here or click to browse
              </p>
              <p className="text-slate-500 text-sm">
                JPEG, PNG, WebP, or PDF - max 10MB
              </p>
            </div>

            {/* Camera input for mobile */}
            <div className="mt-3">
              <label className="flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-medium px-4 py-3 rounded-xl transition-all text-sm cursor-pointer w-full">
                <Camera className="h-4 w-4" />
                Take Photo
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  onChange={handleInputChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Hidden file input for drag-drop/click zone */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleInputChange}
              className="hidden"
            />
          </>
        )}

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-start gap-2 mt-4 bg-navy-950/30 rounded-lg px-3 py-2">
          <FileText className="h-3.5 w-3.5 text-mint-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Our AI reads your receipt and extracts the provider, amount, date, and line items. Your image is stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
