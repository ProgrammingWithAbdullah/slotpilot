import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">
          Back to your appointments
        </Link>
      </div>
    </div>
  );
}
