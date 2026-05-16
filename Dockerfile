# Sử dụng base image Node.js phiên bản Alpine cho nhẹ
FROM node:20-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Copy file package.json và package-lock.json (nếu có) vào container
COPY package*.json ./

# Cài đặt các dependencies cho môi trường production
RUN npm install --production

# Copy toàn bộ mã nguồn dự án vào container
COPY . .

# Mở port 5000 (dựa trên log server chạy ở port 5000)
EXPOSE 5000

# Lệnh để khởi chạy server
CMD ["npm", "start"]
