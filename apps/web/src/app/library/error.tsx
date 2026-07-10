"use client";

export default function LibraryError({ error }: { error: Error }) {
  return <p style={{ padding: "2rem", color: "#b91c1c" }}>Library load failed: {error.message}</p>;
}
