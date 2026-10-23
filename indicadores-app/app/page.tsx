// Placeholder — redirección a la vista por defecto (Dashboard).
// El layout del grupo protegido y el guard de sesión se implementan en tareas posteriores (12.3, 10.2).
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
