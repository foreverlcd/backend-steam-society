import { parseWebOrigins } from './web-origins.js';

describe('parseWebOrigins', () => {
  it('returns an empty list when the variable is missing', () => {
    expect(parseWebOrigins(undefined)).toEqual([]);
  });

  it('returns an empty list when the variable is empty', () => {
    expect(parseWebOrigins('   ')).toEqual([]);
  });

  it('removes spaces and empty entries', () => {
    expect(
      parseWebOrigins(' http://localhost:3001 , , https://app.example.com '),
    ).toEqual(['http://localhost:3001', 'https://app.example.com']);
  });

  it('removes trailing slashes', () => {
    expect(parseWebOrigins('http://localhost:3001/')).toEqual([
      'http://localhost:3001',
    ]);
    expect(parseWebOrigins('https://app.example.com//')).toEqual([
      'https://app.example.com',
    ]);
  });

  it('removes duplicated origins', () => {
    expect(
      parseWebOrigins('http://localhost:3001, http://localhost:3001/'),
    ).toEqual(['http://localhost:3001']);
  });

  it('rejects wildcard origins because CORS uses credentials', () => {
    expect(() => parseWebOrigins('*')).toThrow(/\*/);
  });
});
