'use client';
import { useEffect } from 'react';
import { contarImovel } from '@/lib/whats';
export default function ContarVisita({ codigo }) {
  useEffect(() => { contarImovel(codigo, 'view'); }, [codigo]);
  return null;
}
