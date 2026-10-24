"use client";

import { useSyncExternalStore } from "react";

const FLAG_KEY = "trainer-studio.flags";
const REVIEW_KEY = "trainer-studio.reviewed";

type Book = Record<string, string[]>;

let flagBook: Book = {};
let reviewBook: Book = {};
let epoch = 0;
const listeners = new Set<() => void>();

function read(key: string): Book {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}") as Book;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function write(key: string, book: Book) {
  epoch += 1;
  window.localStorage.setItem(key, JSON.stringify(book));
  listeners.forEach((listener) => listener());
}

function boot() {
  flagBook = read(FLAG_KEY);
  reviewBook = read(REVIEW_KEY);
}

if (typeof window !== "undefined") boot();

function ids(book: Book, projectId: string) {
  return new Set((book[projectId] || []).filter((item) => typeof item === "string"));
}

export function flaggedSet(projectId: string) {
  return ids(flagBook, projectId);
}

export function reviewedSet(projectId: string) {
  return ids(reviewBook, projectId);
}

function toggle(book: Book, key: string, projectId: string, imageId: string) {
  const current = new Set(book[projectId] || []);
  if (current.has(imageId)) current.delete(imageId);
  else current.add(imageId);
  const next = { ...book, [projectId]: [...current] };
  if (key === FLAG_KEY) flagBook = next;
  else reviewBook = next;
  write(key, next);
}

export function toggleFlag(projectId: string, imageId: string) {
  toggle(flagBook, FLAG_KEY, projectId, imageId);
}

export function toggleReviewed(projectId: string, imageId: string) {
  toggle(reviewBook, REVIEW_KEY, projectId, imageId);
}

export function useMarks() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => epoch,
    () => 0,
  );
}
