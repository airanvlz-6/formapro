'use client';
import Forge from '../FormaPro';
import AuthenticatedSurface from './AuthenticatedSurface';

export default function AuthenticatedApp() {
  return <AuthenticatedSurface>{codigo => <Forge authenticatedCodigo={codigo} />}</AuthenticatedSurface>;
}
