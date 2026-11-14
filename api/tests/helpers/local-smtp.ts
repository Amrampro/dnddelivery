import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
/** Loopback-only SMTP receiver for explicit test workflows. Never import into production. */
export async function localSmtp(onMessage:(message:string)=>void) {
  const sockets=new Set<Socket>();
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');let buffer='',data=false,content='';socket.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\r\n')){const offset=buffer.indexOf('\r\n'),line=buffer.slice(0,offset);buffer=buffer.slice(offset+2);if(data){if(line==='.') {data=false;onMessage(content);content='';socket.write('250 Accepted\r\n');}else content+=line+'\r\n';}else if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 SIZE 1048576\r\n');else if(line==='DATA'){data=true;socket.write('354 End data\r\n');}else if(line==='QUIT')socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');}});});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('SMTP port unavailable');return{port:address.port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
