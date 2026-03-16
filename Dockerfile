# Usar uma imagem oficial do Node.js
FROM node:18-alpine

# Definir o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copiar os arquivos de definição de dependências
COPY package*.json ./

# Instalar as dependências do projeto
RUN npm install

# Copiar os arquivos da aplicação para o diretório de trabalho
COPY . .

# Expor a porta que o servidor vai usar
EXPOSE 3000

# Comando para iniciar a aplicação
CMD [ "node", "server.js" ]
