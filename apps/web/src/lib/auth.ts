import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUserDto } from "./api";

export async function requireSignedInUser(): Promise<AuthUserDto> {
  try {
    const result = await getCurrentUser();
    return result.user;
  } catch {
    redirect("/login");
  }
}

export async function requireAdminUser(): Promise<AuthUserDto> {
  const user = await requireSignedInUser();
  if (user.accountRole !== "admin") {
    redirect("/");
  }
  return user;
}
