"use client";

/** Interrupteur réutilisable, basé sur le markup .toggle-switch de globals.css. */
export default function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-switch__slider" />
    </label>
  );
}
