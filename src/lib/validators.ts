export const validateUsername = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (v.includes(" ")) return { ok: false, msg: "No spaces allowed" };
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return { ok: false, msg: "Letters, numbers and underscores only" };
  if (v.length < 3) return { ok: false, msg: "At least 3 characters" };
  if (v.length > 30) return { ok: false, msg: "Max 30 characters" };
  return { ok: true, msg: "Looks good!" };
};

export const validateEmail = (v: string, school?: string) => {
  if (!v) return { ok: false, msg: "" };
  if (!v.includes("@")) return { ok: false, msg: "Enter a valid email" };
  if (school === "PAU") return v.toLowerCase().endsWith("@pau.edu.ng")
    ? { ok: true, msg: "Valid PAU email ✓" }
    : { ok: false, msg: "PAU students must use @pau.edu.ng" };
  if (school === "FUTO") {
    const ok = v.toLowerCase().endsWith("@futo.edu.ng") || v.toLowerCase().endsWith("@gmail.com");
    return ok ? { ok: true, msg: "Valid FUTO email ✓" } : { ok: false, msg: "Use @futo.edu.ng or Gmail" };
  }
  if (!v.includes(".")) return { ok: false, msg: "Enter a valid email" };
  return { ok: true, msg: "" };
};

export const validatePhone = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  const c = v.replace(/[\s\-]/g, "");
  if (!/^\d+$/.test(c)) return { ok: false, msg: "Numbers only" };
  if (c.length < 11) return { ok: false, msg: `${11 - c.length} more digit(s) needed` };
  if (c.length > 11) return { ok: false, msg: "Must be 11 digits" };
  if (!c.startsWith("0")) return { ok: false, msg: "Must start with 0 (e.g. 08012345678)" };
  return { ok: true, msg: "Valid ✓" };
};

export const validatePassword = (v: string) => {
  if (!v) return { ok: false, checks: { length: false, upper: false, lower: false, number: false } };
  const checks = {
    length: v.length >= 8,
    upper: /[A-Z]/.test(v),
    lower: /[a-z]/.test(v),
    number: /\d/.test(v),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
};

export const validateMatric = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (!/^\d{11}$/.test(v)) return { ok: false, msg: "Must be exactly 11 digits" };
  const year = parseInt(v.substring(0, 4));
  if (year < 2015 || year > new Date().getFullYear()) return { ok: false, msg: "Enter a valid admission year" };
  return { ok: true, msg: "Valid matric number ✓" };
};
