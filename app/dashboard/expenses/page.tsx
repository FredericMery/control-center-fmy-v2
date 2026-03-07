import { redirect } from 'next/navigation';

export default function DashboardExpensesPage() {
  redirect('/expenses/list');
}
