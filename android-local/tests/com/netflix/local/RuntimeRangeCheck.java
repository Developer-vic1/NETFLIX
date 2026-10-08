package com.netflix.local;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
public class RuntimeRangeCheck {
  static int checks;
  static void range(String spec,long size,long start,long end) {
    long[] actual=LocalMediaServer.requestedRange(spec,size);
    if(!Arrays.equals(actual,new long[]{start,end}))throw new AssertionError(spec+Arrays.toString(actual));
    checks++;
  }
  static void invalid(String spec,long size) {
    try { LocalMediaServer.requestedRange(spec,size); throw new AssertionError("accepted:"+spec); }
    catch(IllegalArgumentException expected) { checks++; }
  }
  public static void main(String[]args)throws Exception {
    range(null,0,0,-1);range(null,9000000000L,0,8999999999L);
    range("bytes=0-4095",9000000000L,0,4095);
    range("bytes=8000000000-",9000000000L,8000000000L,8999999999L);
    range("bytes=-500",100,0,99);range("bytes=-2",100,98,99);
    range("bytes=99-999",100,99,99);range("bytes=0-0",100,0,0);
    for(String value:new String[]{"bytes=-","bytes=-0","bytes=100-","bytes=4-3","bytes=0-2,4-6","bytes=-1-2","bytes=0-999999999999999999999","items=0-1","bytes=0-1 "})invalid(value,100);
    invalid("bytes=0-0",0);
    if(!LibraryAccess.decodedPath("series/isla_T11_%231.mp4").equals("series/isla_T11_#1.mp4"))throw new AssertionError("encoded episode"); checks++;
    for(String value:new String[]{"../secret","data/%2e%2e/x","/root","a//b","a%5cb","a%00b","a%ZZb"}) {
      try { LibraryAccess.decodedPath(value); throw new AssertionError("path:"+value); }
      catch(IOException expected){checks++;}
    }
    File file=File.createTempFile("runtime-range", ".bin");
    try {
      try(FileOutputStream out=new FileOutputStream(file)){out.write("0123456789abcdef".getBytes(StandardCharsets.US_ASCII));}
      FileInputStream input=new FileInputStream(file);input.getChannel().position(3);
      try(LibraryAccess.Resource resource=new LibraryAccess.Resource(input,10,"x")) {
        resource.seek(5);if(resource.stream.read()!='8')throw new AssertionError("asset offset");checks++;
      }
    } finally {file.delete();}
    System.out.println(checks+" native range/path checks passed");
  }
}
