'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink, Book } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProxyURLCardProps {
  proxyUrl: string;
  targetUrl: string;
  apiName: string;
}

export function ProxyURLCard({ proxyUrl, targetUrl, apiName }: ProxyURLCardProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Proxy URL</CardTitle>
            <CardDescription>
              Use this URL instead of your original API endpoint
            </CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Book className="h-4 w-4" />
                Integration Guide
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Integration Guide for {apiName}</DialogTitle>
                <DialogDescription>
                  Learn how to integrate {apiName} with your application
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="javascript" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="go">Go</TabsTrigger>
                </TabsList>
                
                <TabsContent value="javascript" className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Using Fetch API</h4>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`const response = await fetch('${proxyUrl}/your-endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({ /* your data */ })
});

const data = await response.json();`}
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="python" className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Using Requests Library</h4>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`import requests

response = requests.post(
    '${proxyUrl}/your-endpoint',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={} # your data
)

data = response.json()`}
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="curl" className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">cURL Command</h4>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`curl -X POST '${proxyUrl}/your-endpoint' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{}'`}
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="go" className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Using HTTP Client</h4>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`package main

import (
    "bytes"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("POST", "${proxyUrl}/your-endpoint", bytes.NewBuffer([]byte("{}")))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
    
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-900/50">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>💡 Pro Tip:</strong> Simply replace <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">{targetUrl}</code> with <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">{proxyUrl}</code> in your existing code. No other changes needed!
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Your Proxy URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={proxyUrl}
              className="font-mono text-sm bg-muted"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => copyToClipboard(proxyUrl)}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            All requests to this URL are automatically rate-limited and monitored
          </p>
        </div>

        <div className="space-y-2">
          <Label>Original Target URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={targetUrl}
              className="font-mono text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => window.open(targetUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
