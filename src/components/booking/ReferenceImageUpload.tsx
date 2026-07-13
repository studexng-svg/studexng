"use client";

import { Plus, X } from "lucide-react";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGES = 5;

interface ReferenceImageUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}

/**
 * Reusable multi-slot image picker for "upload reference photos" flows.
 * Pattern lifted from src/app/vendor/dashboard/listings/page.tsx's photo grid,
 * generalized to a variable-length array instead of 5 fixed model fields.
 */
export default function ReferenceImageUpload({ files, onChange, max = MAX_IMAGES }: ReferenceImageUploadProps) {
  const addFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    if (files.length >= max) return;
    onChange([...files, file]);
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const slots = Math.min(files.length + 1, max);

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const file = files[i];
          return (
            <div key={i} className="relative aspect-square">
              {file ? (
                <>
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="w-full h-full object-cover rounded-xl border-2 border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </>
              ) : (
                <label className="w-full h-full border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition">
                  <Plus className="w-4 h-4 text-stone-300" />
                  <span className="text-xs text-stone-300 mt-0.5">Add</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) addFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-stone-400 mt-2">
        Optional — up to {max} photos (JPG, PNG, or WEBP) to show the vendor what you want.
      </p>
    </div>
  );
}
