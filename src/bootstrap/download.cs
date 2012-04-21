using System;
using System.Net;
using System.ComponentModel;
using System.Threading;

class Program
{
    static void OnError(string url, string file, Exception e)
    {
        Console.WriteLine("Error downloading from " + url + " to " + file + ":");
        Console.WriteLine(e.ToString());
        Environment.Exit(1);
    }

    static void Main(string[] args)
    {
        int timeout = 0;

        if ((args.Length % 2) != 1 || args.Length == 1 || !int.TryParse(args[0], out timeout))
        {
            Console.WriteLine("Usage: download.exe <timeout_in_seconds> [<url> <output_file>]+");
            Environment.Exit(1);
        }

        int n = 1;
        int completed = 0;
        ManualResetEvent waitHandle = new ManualResetEvent(false);

        try
        {
            while (n < args.Length)
            {
                WebClient client = new WebClient();
                int k = n;
                client.DownloadFileCompleted += new AsyncCompletedEventHandler(delegate (object sender, AsyncCompletedEventArgs e) {
                    if (e.Error != null)
                    {
                        OnError(args[k], args[k + 1], e.Error);
                    }

                    Console.WriteLine("Finished download from " + args[k] + " to " + args[k + 1]);

                    if (++completed == ((args.Length - 1) / 2))
                    {
                        waitHandle.Set();
                    }
                });
                Console.WriteLine("Starting download from " + args[n] + " to " + args[n + 1]);
                client.DownloadFileAsync(new Uri(args[n]), args[n + 1]);
                n += 2;
            }
        }
        catch (Exception e)
        {
            OnError(args[n], args[n + 1], e);
        }

        if (!waitHandle.WaitOne(new TimeSpan(0, 0, timeout)))
        {
            Console.WriteLine("Download timed out.");
            Environment.Exit(1);
        }
    }
}
