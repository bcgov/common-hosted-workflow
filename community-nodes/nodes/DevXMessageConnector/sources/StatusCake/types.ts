// See https://www.statuscake.com/kb/knowledge-base/how-to-use-the-web-hook-url/#:~:text=%7CURL%7C%20The%20test%20URL,=%7CCODE%7C&Status=%7CSTATUS%7C

export interface StatusCakePayload {
  Token: string;
  Status: 'Up' | 'Down';
  StatusCode: number;
  URL: string;
  IP: string;
  Tags: string;
  Name: string;
  Checkrate: number;
}
